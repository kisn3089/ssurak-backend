import { Injectable, NotFoundException } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { PrismaService } from "src/prisma/prisma.service";
import { Owner, Prisma, PublicMenu } from "@ssurak/db";
import type { BulkMenuItem } from "@ssurak/schema";
import {
  BulkCreateMenusPayloadDto,
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
import {
  REORDER_TX_TIMEOUT_MS,
  withReorderLock,
} from "src/utils/helper/withReorderLock";
import { Tx } from "src/utils/helper/transactionPipe";
import { MenuDraftService } from "./menu-draft.service";

const BULK_TX_TIMEOUT_MS = 15_000;

@Injectable()
export class MenuService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly storageService: StorageService,
    private readonly menuDraftService: MenuDraftService
  ) {}

  async createMenu(
    client: Owner,
    storeId: string,
    createPayload: CreateMenuPayloadDto
  ): Promise<PublicMenu> {
    const { categoryId, imageKey, ...rest } = createPayload;
    await this.assertCategoryBelongsToStore(client, categoryId, storeId);

    const promotedKey = imageKey
      ? await this.storageService.promoteMenuImage(imageKey, client.publicId)
      : null;

    return await this.prismaService.menu.create({
      data: {
        ...rest,
        imageKey: promotedKey,
        sortOrder: await this.nextSortOrder(categoryId),
        category: { connect: { publicId: categoryId } },
      },
      omit: OMIT_MENU_PRIVATE,
    });
  }

  async bulkCreateMenus(
    client: Owner,
    storeId: string,
    { items, draftId }: BulkCreateMenusPayloadDto
  ): Promise<PublicMenu[]> {
    const publicIds = items.map(() => createId());

    const bulkCreateResult = await this.prismaService.$transaction(
      async (tx) => {
        const categoryIds = await this.resolveBulkCategories(
          tx,
          client,
          storeId,
          items
        );

        const sortOrders = await this.nextSortOrders(tx, categoryIds);

        await tx.menu.createMany({
          data: items.map((item, index) => ({
            publicId: publicIds[index],
            name: item.name,
            price: item.price,
            description: item.description ?? null,
            isAvailable: item.isAvailable,
            categoryId: categoryIds[index],
            sortOrder: sortOrders[index],
          })),
        });

        const created = await tx.menu.findMany({
          where: { publicId: { in: publicIds } },
          omit: OMIT_MENU_PRIVATE,
        });

        // findMany는 요청 순서를 보장하지 않는다. 사장님이 초안 화면에서 본 순서와
        // 응답 순서가 어긋나면 어느 줄이 어떻게 저장됐는지 대조할 수 없다.
        const byPublicId = new Map(
          created.map((menu) => [menu.publicId, menu])
        );
        return publicIds.flatMap((publicId) => {
          const menu = byPublicId.get(publicId);
          return menu ? [menu] : [];
        });
      },
      { timeout: BULK_TX_TIMEOUT_MS }
    );

    if (draftId) {
      await this.menuDraftService.markCommitted(client, storeId, draftId);
    }

    return bulkCreateResult;
  }

  /**
   * 항목별 카테고리를 내부 id로 확정한다(입력 순서 유지).
   *
   * `categoryName`으로 온 것은 없으면 만든다. 같은 이름이 여러 항목에 걸쳐 있어도
   * 카테고리는 하나만 생기고, 같은 매장에 동시 요청이 들어와도
   * `@@unique([storeId, name])` 위에서 upsert하므로 중복이 생기지 않는다.
   */
  private async resolveBulkCategories(
    tx: Tx,
    client: Owner,
    storeId: string,
    items: BulkMenuItem[]
  ): Promise<bigint[]> {
    const store = await tx.store.findFirstOrThrow({
      where: { publicId: storeId, owner: { id: client.id } },
      select: { id: true },
    });

    const existingCategories = await tx.category.findMany({
      where: { storeId: store.id },
      select: { id: true, publicId: true, name: true, sortOrder: true },
    });

    const byPublicId = new Map(
      existingCategories.map((category) => [category.publicId, category.id])
    );
    const byName = new Map(
      existingCategories.map((category) => [category.name, category.id])
    );
    let sortOrder = existingCategories.reduce(
      (max, category) => Math.max(max, category.sortOrder),
      0
    );

    for (const publicId of new Set(
      items.flatMap((item) => (item.categoryId ? [item.categoryId] : []))
    )) {
      if (!byPublicId.has(publicId)) {
        throw new NotFoundException(`카테고리 ${publicId}를 찾을 수 없습니다.`);
      }
    }

    for (const name of new Set(
      items.flatMap((item) => (item.categoryName ? [item.categoryName] : []))
    )) {
      if (byName.has(name)) continue;

      sortOrder += SORT_ORDER_STEP;
      const category = await tx.category.upsert({
        where: { storeId_name: { storeId: store.id, name } },
        update: {},
        create: { name, sortOrder, store: { connect: { id: store.id } } },
        select: { id: true },
      });
      byName.set(name, category.id);
    }

    return items.map((item) => {
      const resolved = item.categoryId
        ? byPublicId.get(item.categoryId)
        : byName.get(item.categoryName ?? "");

      if (resolved === undefined) {
        throw new Error("bulk category resolution missed an item");
      }
      return resolved;
    });
  }

  private async nextSortOrders(
    tx: Tx,
    categoryIds: bigint[]
  ): Promise<number[]> {
    const cursors = new Map<bigint, number>();

    for (const categoryId of new Set(categoryIds)) {
      const last = await tx.menu.findFirst({
        where: { categoryId, deletedAt: null },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      cursors.set(categoryId, last?.sortOrder ?? 0);
    }

    return categoryIds.map((categoryId) => {
      const next = (cursors.get(categoryId) ?? 0) + SORT_ORDER_STEP;
      cursors.set(categoryId, next);
      return next;
    });
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
    const { categoryId, imageKey, ...rest } = updatePayload;

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
        data: { ...rest, ...imageUpdate, ...moveUpdate },
        omit: OMIT_MENU_PRIVATE,
      });
    });
  }

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
    return await this.prismaService.$transaction(
      (tx) =>
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
        }),
      { timeout: REORDER_TX_TIMEOUT_MS }
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
