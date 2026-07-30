import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Prisma, PublicMenu } from "@ssurak/db";
import {
  CreateMenuPayloadDto,
  ReorderMenusPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import { OMIT_MENU_PRIVATE } from "src/common/query/session-query.const";
import { StorageService } from "src/storage/storage.service";
import {
  assertSameSet,
  renumberSortOrder,
  SORT_ORDER_STEP,
} from "src/utils/helper/reorder";
import { withStoreLock } from "src/utils/helper/withStoreLock";
import { Tx } from "src/utils/helper/transactionPipe";

@Injectable()
export class MenuService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService
  ) {}

  private readonly ORDER_BY_SORT: Prisma.MenuOrderByWithRelationInput[] = [
    { sortOrder: "asc" },
    { id: "asc" },
  ];

  /**
   * 메뉴는 카테고리 안 맨 뒤에 붙는다. 동시 생성으로 sortOrder가 겹쳐도 목록은
   * id 타이브레이크로 결정적이고, 다음 재정렬에서 전부 다시 매겨진다.
   */
  async createMenu(
    storeId: string,
    ownerPublicId: string,
    createPayload: CreateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, imageKey, requiredOptions, customOptions, ...rest } =
      createPayload;
    await this.assertCategoryBelongsToStore(categoryId, storeId);

    const promotedKey = imageKey
      ? await this.storageService.promoteMenuImage(imageKey, ownerPublicId)
      : null;

    return await this.prismaService.menu.create({
      data: {
        ...rest,
        imageKey: promotedKey,
        sortOrder: await this.nextSortOrder(categoryId),
        requiredOptions: this.jsonInput(requiredOptions),
        customOptions: this.jsonInput(customOptions),
        category: { connect: { publicId: categoryId } },
      },
      omit: OMIT_MENU_PRIVATE,
    });
  }

  /** nullable Json payload를 Prisma 입력으로 정규화한다. */
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
    const { categoryId, imageKey, requiredOptions, customOptions, ...rest } =
      updatePayload;

    const imageUpdate = await this.resolveImageUpdate(imageKey, ownerPublicId);

    return await this.prismaService.$transaction(async (tx) => {
      const moveUpdate = await this.resolveCategoryMove(
        tx,
        storeId,
        menuId,
        categoryId
      );

      return await tx.menu.update({
        where: this.whereMenuInStore(menuId, storeId),
        data: {
          ...rest,
          ...imageUpdate,
          ...moveUpdate,
          requiredOptions: this.jsonInput(requiredOptions),
          customOptions: this.jsonInput(customOptions),
        },
        omit: OMIT_MENU_PRIVATE,
      });
    });
  }

  /**
   * 카테고리 이동을 Prisma data 조각으로 바꾼다.
   * 옮겨온 메뉴는 새 카테고리의 맨 뒤에 놓는다 — 원래 카테고리의 순서를 그대로
   * 들고 오면 이미 그 자리를 쓰는 메뉴와 겹친다. 세부 위치는 재정렬로 잡는다.
   */
  private async resolveCategoryMove(
    tx: Tx,
    storeId: string,
    menuId: string,
    categoryId: string | undefined
  ): Promise<Prisma.MenuUpdateInput> {
    if (!categoryId) return {};

    await this.assertCategoryBelongsToStore(categoryId, storeId, tx);

    const { category } = await tx.menu.findFirstOrThrow({
      where: this.whereMenuInStore(menuId, storeId),
      select: { category: { select: { publicId: true } } },
    });
    // 같은 카테고리를 그대로 보낸 경우까지 맨 뒤로 밀지 않는다.
    if (category.publicId === categoryId) return {};

    return {
      category: { connect: { publicId: categoryId } },
      sortOrder: await this.nextSortOrder(categoryId, tx),
    };
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

  /**
   * 카테고리 안 메뉴 순서를 요청 배열대로 통째로 교체한다(멱등).
   * 읽고-다시매기는 흐름이라 store 행을 잠가 동시 재정렬을 직렬화한다.
   */
  async reorderMenus(
    storeId: string,
    { categoryId, menuIds }: ReorderMenusPayloadDto
  ): Promise<PublicMenu[]> {
    return await this.prismaService.$transaction((tx) =>
      withStoreLock(tx, storeId, async () => {
        await this.assertCategoryBelongsToStore(categoryId, storeId, tx);

        const current = await tx.menu.findMany({
          where: this.whereMenusInCategory(categoryId),
          select: { publicId: true },
        });

        assertSameSet(
          current.map(({ publicId }) => publicId),
          menuIds,
          "MENU_ORDER_MISMATCH"
        );

        await renumberSortOrder(tx, "menu", menuIds);

        return await tx.menu.findMany({
          where: this.whereMenusInCategory(categoryId),
          orderBy: this.ORDER_BY_SORT,
          omit: OMIT_MENU_PRIVATE,
        });
      })
    );
  }

  private async assertCategoryBelongsToStore(
    categoryPublicId: string,
    storePublicId: string,
    tx: Tx = this.prismaService
  ): Promise<string> {
    const category = await tx.category.findFirstOrThrow({
      where: {
        publicId: categoryPublicId,
        store: { publicId: storePublicId },
      },
      select: { publicId: true },
    });

    return category.publicId;
  }

  /** 카테고리의 마지막 메뉴 뒤에 붙일 표시 순서. */
  private async nextSortOrder(
    categoryPublicId: string,
    tx: Tx = this.prismaService
  ): Promise<number> {
    const last = await tx.menu.findFirst({
      where: this.whereMenusInCategory(categoryPublicId),
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? 0) + SORT_ORDER_STEP;
  }

  async softDeleteMenu(storeId: string, menuId: string): Promise<void> {
    await this.prismaService.menu.update({
      where: this.whereMenuInStore(menuId, storeId),
      data: { deletedAt: new Date() },
    });
  }

  /** 소프트 삭제된 메뉴는 순서 대상이 아니다 — 목록에도 안 나온다. */
  private whereMenusInCategory(
    categoryPublicId: string
  ): Prisma.MenuWhereInput {
    return {
      category: { publicId: categoryPublicId },
      deletedAt: null,
    };
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
}
