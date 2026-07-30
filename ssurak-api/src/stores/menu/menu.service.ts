import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { Owner, Prisma, PublicMenu } from "@ssurak/db";
import {
  CreateMenuPayloadDto,
  ReorderMenusPayloadDto,
  UpdateMenuPayloadDto,
} from "src/dto/request/menu.dto";
import {
  MENU_ORDER_BY,
  OMIT_MENU_PRIVATE,
} from "src/common/query/session-query.const";
import { StorageService } from "src/storage/storage.service";
import {
  assertSameSet,
  renumberSortOrder,
  SORT_ORDER_STEP,
} from "src/utils/helper/reorder";
import { withReorderLock } from "src/utils/helper/withReorderLock";
import { Tx } from "src/utils/helper/transactionPipe";

@Injectable()
export class MenuService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService
  ) {}

  /**
   * 메뉴는 카테고리 안 맨 뒤에 붙는다. 동시 생성으로 sortOrder가 겹쳐도 목록은
   * id 타이브레이크로 결정적이고, 다음 재정렬에서 전부 다시 매겨진다.
   */
  async createMenu(
    client: Owner,
    storeId: string,
    createPayload: CreateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, imageKey, requiredOptions, customOptions, ...rest } =
      createPayload;
    await this.assertCategoryBelongsToStore(client, categoryId, storeId);

    const promotedKey = imageKey
      ? await this.storageService.promoteMenuImage(imageKey, client.publicId)
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

  async getMenuUnique(
    client: Owner,
    storeId: string,
    menuId: string
  ): Promise<PublicMenu> {
    return await this.prismaService.menu.findFirstOrThrow({
      where: this.whereMenuInStore(client, storeId, menuId),
      omit: OMIT_MENU_PRIVATE,
    });
  }

  async partialUpdateMenu(
    client: Owner,
    storeId: string,
    menuId: string,
    updatePayload: UpdateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, imageKey, requiredOptions, customOptions, ...rest } =
      updatePayload;

    const imageUpdate = await this.resolveImageUpdate(
      imageKey,
      client.publicId
    );

    return await this.prismaService.$transaction(async (tx) => {
      const moveUpdate = await this.resolveCategoryMove(
        tx,
        client,
        storeId,
        menuId,
        categoryId
      );

      return await tx.menu.update({
        where: this.whereMenuInStore(client, storeId, menuId),
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
    client: Owner,
    storeId: string,
    menuId: string,
    categoryId: string | undefined
  ): Promise<Prisma.MenuUpdateInput> {
    if (!categoryId) return {};

    await this.assertCategoryBelongsToStore(client, categoryId, storeId, tx);

    const { category } = await tx.menu.findFirstOrThrow({
      where: this.whereMenuInStore(client, storeId, menuId),
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
   * 읽고-다시매기는 흐름이라 매장 단위 재정렬 락으로 동시 요청을 직렬화한다.
   */
  async reorderMenus(
    client: Owner,
    storeId: string,
    { categoryId, menuIds }: ReorderMenusPayloadDto
  ): Promise<PublicMenu[]> {
    return await this.prismaService.$transaction((tx) =>
      withReorderLock(tx, storeId, async () => {
        await this.assertCategoryBelongsToStore(
          client,
          categoryId,
          storeId,
          tx
        );

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
          orderBy: MENU_ORDER_BY,
          omit: OMIT_MENU_PRIVATE,
        });
      })
    );
  }

  private async assertCategoryBelongsToStore(
    client: Owner,
    categoryPublicId: string,
    storePublicId: string,
    tx: Tx = this.prismaService
  ): Promise<string> {
    const category = await tx.category.findFirstOrThrow({
      where: {
        publicId: categoryPublicId,
        ...this.whereInStore(client, storePublicId),
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

  async softDeleteMenu(
    client: Owner,
    storeId: string,
    menuId: string
  ): Promise<void> {
    await this.prismaService.menu.update({
      where: this.whereMenuInStore(client, storeId, menuId),
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
    client: Owner,
    storeId: string,
    menuId: string
  ): Prisma.MenuWhereUniqueInput {
    return {
      publicId: menuId,
      category: this.whereInStore(client, storeId),
    };
  }

  private whereInStore(client: Owner, storeId: string) {
    return {
      store: { publicId: storeId, owner: { id: client.id } },
    } satisfies Prisma.CategoryWhereInput;
  }
}
