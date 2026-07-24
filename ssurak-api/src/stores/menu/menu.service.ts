import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, PublicMenu } from "@ssurak/db";
import {
  CreateMenuPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { OMIT_MENU_PRIVATE } from "src/common/query/session-query.const";
import { StorageService } from "src/storage/storage.service";

/** Sparse 정렬값 간격(10, 20, 30…). 충돌 재조정 시 새 자리를 벌리는 기본 보폭. */
const SORT_ORDER_STEP = 10;

@Injectable()
export class MenuService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService
  ) {}

  async createMenu(
    storeId: string,
    ownerPublicId: string,
    createPayload: CreateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, imageKey, requiredOptions, customOptions, ...rest } =
      createPayload;
    await this.assertCategoryBelongsToStore(categoryId, storeId);

    // 이미지를 먼저 정식 경로로 승격한 뒤 DB에 쓴다. 이 순서라면 create가 실패했을 때
    // 방금 승격한 menu/ 객체가 orphan으로 남지만, 깨진 참조보다는 낫다고 보고 감수한다.
    // (참조됐을 수 있는 객체를 지우지 않는 정책과 같은 선상 — StorageService엔 삭제가 없다.)
    const promotedKey = imageKey
      ? await this.storageService.promoteMenuImage(imageKey, ownerPublicId)
      : null;

    return await this.prismaService.menu.create({
      data: {
        ...rest,
        imageKey: promotedKey,
        requiredOptions: this.jsonInput(requiredOptions),
        customOptions: this.jsonInput(customOptions),
        category: { connect: { publicId: categoryId } },
      },
      omit: OMIT_MENU_PRIVATE,
    });
  }

  /**
   * nullable Json payload를 Prisma 입력으로 정규화한다.
   * Prisma의 Json 필드는 raw `null`을 받지 않으므로 null은 컬럼 NULL(DbNull)로 지우고,
   * undefined는 "건드리지 않음"으로 그대로 흘린다.
   */
  private jsonInput<T>(value: T | null | undefined) {
    return value === null ? Prisma.DbNull : value;
  }

  async getMenuUnique(storeId: string, menuId: string): Promise<PublicMenu> {
    return await this.prismaService.menu.findFirstOrThrow({
      where: {
        publicId: menuId,
        category: { store: { publicId: storeId } },
      },
      omit: OMIT_MENU_PRIVATE,
    });
  }

  async partialUpdateMenu(
    storeId: string,
    menuId: string,
    ownerPublicId: string,
    updatePayload: UpdateMenuPayloadDto
  ): Promise<PublicMenu> {
    const {
      categoryId,
      imageKey,
      sortOrder,
      requiredOptions,
      customOptions,
      ...rest
    } = updatePayload;

    // S3 승격은 네트워크 I/O라 트랜잭션 밖에서 먼저 끝낸다
    const imageUpdate = await this.resolveImageUpdate(imageKey, ownerPublicId);

    return await this.prismaService.$transaction(async (tx) => {
      if (categoryId) {
        await this.assertCategoryBelongsToStore(categoryId, storeId, tx);
      }

      // sortOrder를 지정한 경우, 같은 카테고리에 값이 겹치는 메뉴를 미리 비켜준다.
      if (sortOrder !== undefined) {
        await this.rebalanceSortOrder(
          tx,
          storeId,
          menuId,
          categoryId,
          sortOrder
        );
      }

      return await tx.menu.update({
        where: this.whereMenuInStore(menuId, storeId),
        data: {
          ...rest,
          ...imageUpdate,
          ...(sortOrder !== undefined && { sortOrder }),
          requiredOptions: this.jsonInput(requiredOptions),
          customOptions: this.jsonInput(customOptions),
          ...(categoryId && {
            category: { connect: { publicId: categoryId } },
          }),
        },
        omit: OMIT_MENU_PRIVATE,
      });
    });
  }

  /**
   * 대상 메뉴가 차지하려는 `sortOrder`가 같은 카테고리의 다른 메뉴와 겹치면,
   * 그 메뉴를 다음 슬롯의 중간값으로 밀어 충돌을 해소한다.
   *
   * - 정수 간격이 남아 있으면 겹친 메뉴 1건만 옮긴다(update 1회).
   * - `sortOrder`가 인접 정수라 중간값이 없으면(간격 소진) `sortOrder` 이상을
   *   `updateMany` + `increment` 한 문장으로 STEP만큼 밀어 자리를 비운다.
   *   개별 update를 map으로 N번 도는 대신 단일 UPDATE로 처리해 왕복을 최소화한다.
   */
  private async rebalanceSortOrder(
    tx: Prisma.TransactionClient,
    storeId: string,
    menuId: string,
    categoryId: string | undefined,
    sortOrder: number
  ): Promise<void> {
    // 카테고리 변경을 함께 요청했으면 그 카테고리가, 아니면 현재 카테고리가 기준.
    const categoryPublicId =
      categoryId ??
      (
        await tx.menu.findFirstOrThrow({
          where: {
            publicId: menuId,
            category: { store: { publicId: storeId } },
          },
          select: { category: { select: { publicId: true } } },
        })
      ).category.publicId;

    const scope = {
      category: { publicId: categoryPublicId },
      deletedAt: null,
      publicId: { not: menuId },
    } satisfies Prisma.MenuWhereInput;

    const duplicate = await tx.menu.findFirst({
      where: { ...scope, sortOrder },
      select: { publicId: true },
    });
    if (!duplicate) return;

    // 겹친 값 바로 위(가장 가까운 상위) 메뉴. 이게 있으면 그 사이로 밀어 넣는다.
    const next = await tx.menu.findFirst({
      where: { ...scope, sortOrder: { gt: sortOrder } },
      orderBy: { sortOrder: "asc" },
      select: { sortOrder: true },
    });

    const newOrder = next
      ? Math.floor((sortOrder + next.sortOrder) / 2)
      : sortOrder + SORT_ORDER_STEP;

    // 중간값이 겹친 값과 같아지면(예: X와 X+1 사이) 정수 자리가 없다 → 뒤쪽을 통째로 민다.
    if (next && newOrder === sortOrder) {
      await tx.menu.updateMany({
        where: { ...scope, sortOrder: { gte: sortOrder } },
        data: { sortOrder: { increment: SORT_ORDER_STEP } },
      });
      return;
    }

    await tx.menu.update({
      where: { publicId: duplicate.publicId },
      data: { sortOrder: newOrder },
    });
  }

  /** 수정 요청의 `imageKey`를 Prisma data 조각으로 바꾼다. */
  private async resolveImageUpdate(
    imageKey: string | null | undefined,
    ownerPublicId: string
  ): Promise<{ imageKey?: string | null }> {
    if (imageKey === undefined) return {};
    if (imageKey === null) return { imageKey: null };

    return {
      imageKey: await this.storageService.promoteMenuImage(
        imageKey,
        ownerPublicId
      ),
    };
  }

  async softDeleteMenu(storeId: string, menuId: string): Promise<void> {
    await this.prismaService.menu.update({
      where: this.whereMenuInStore(menuId, storeId),
      data: { deletedAt: new Date() },
    });
  }

  private whereMenuInStore(
    menuId: string,
    storeId: string
  ): Prisma.MenuWhereUniqueInput {
    return {
      publicId: menuId,
      category: { store: { publicId: storeId } },
    };
  }

  private async assertCategoryBelongsToStore(
    categoryPublicId: string,
    storePublicId: string,
    tx?: Prisma.TransactionClient
  ): Promise<string> {
    const category = await (tx ?? this.prismaService).category.findFirstOrThrow(
      {
        where: {
          publicId: categoryPublicId,
          store: { publicId: storePublicId },
        },
        select: { publicId: true },
      }
    );

    return category.publicId;
  }
}
