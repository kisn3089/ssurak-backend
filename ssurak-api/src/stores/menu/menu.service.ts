import { Injectable } from "@nestjs/common";
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

/**
 * 일괄 등록 트랜잭션 예산.
 *
 * Prisma 기본값 5초로는 부족하다 — 최대 100개 항목에 카테고리 upsert가 앞서고,
 * 예산을 넘기면 P2028이 전역 필터에서 원인 불명의 400으로 나간다.
 */
const BULK_TX_TIMEOUT_MS = 15_000;

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
    const { categoryId, imageKey, ...rest } = createPayload;
    await this.assertCategoryBelongsToStore(client, categoryId, storeId);

    // S3 승격은 트랜잭션 밖에 둔다 — 네트워크 왕복을 트랜잭션 시간 예산에 태우지 않는다.
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

  /**
   * 메뉴판 사진 초안을 확정해 한 번에 등록한다.
   *
   * 개별 생성 API를 N번 호출하는 것과 다른 점은 원자성이다 — 30개 중 17번째가
   * 실패하면 절반만 등록된 상태로 남고, 사장님은 어디까지 들어갔는지 세어가며
   * 나머지를 다시 넣어야 한다. 전부 되거나 전부 안 되는 편이 복구 가능하다.
   *
   * 초안에는 이미지가 없으므로 S3 승격(promoteMenuImage)이 없다 —
   * 개별 생성과 달리 트랜잭션 안에 네트워크 왕복이 끼지 않는다.
   */
  async bulkCreateMenus(
    client: Owner,
    storeId: string,
    { items }: BulkCreateMenusPayloadDto
  ): Promise<PublicMenu[]> {
    // publicId를 DB 기본값에 맡기지 않고 여기서 만든다.
    // createMany는 생성된 행을 돌려주지 않으므로, 방금 넣은 것만 정확히 되읽으려면
    // 키를 미리 알고 있어야 한다(이름으로 되찾으면 동명 메뉴와 구분되지 않는다).
    const publicIds = items.map(() => createId());

    return await this.prismaService.$transaction(
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

    const byPublicId = new Map<string, bigint>();
    const byName = new Map<string, bigint>();

    for (const publicId of new Set(
      items.flatMap((item) => (item.categoryId ? [item.categoryId] : []))
    )) {
      // 남의 매장 카테고리 ID를 실어 보내면 여기서 걸린다(가드는 매장까지만 본다).
      const category = await tx.category.findFirstOrThrow({
        where: { publicId, storeId: store.id },
        select: { id: true },
      });
      byPublicId.set(publicId, category.id);
    }

    for (const name of new Set(
      items.flatMap((item) => (item.categoryName ? [item.categoryName] : []))
    )) {
      const category = await tx.category.upsert({
        where: { storeId_name: { storeId: store.id, name } },
        update: {},
        create: {
          name,
          sortOrder: await this.nextCategorySortOrder(tx, store.id),
          store: { connect: { id: store.id } },
        },
        select: { id: true },
      });
      byName.set(name, category.id);
    }

    return items.map((item) => {
      const resolved = item.categoryId
        ? byPublicId.get(item.categoryId)
        : byName.get(item.categoryName ?? "");

      // 스키마가 categoryId·categoryName 중 정확히 하나를 강제하므로 도달하지 않는다.
      if (resolved === undefined) {
        throw new Error("bulk category resolution missed an item");
      }
      return resolved;
    });
  }

  /**
   * 항목별 sortOrder를 카테고리 안 맨 뒤에 이어 붙인다.
   * 카테고리마다 현재 최대값을 한 번만 읽고 메모리에서 증가시킨다 —
   * 항목마다 다시 읽으면 같은 값이 반복돼 전부 겹친다.
   */
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

  /** 새 카테고리는 매장의 마지막 카테고리 뒤에 붙는다. */
  private async nextCategorySortOrder(
    tx: Tx,
    storeId: bigint
  ): Promise<number> {
    const last = await tx.category.findFirst({
      where: { storeId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? 0) + SORT_ORDER_STEP;
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
