import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { NotFoundException } from "@nestjs/common";
import { Category, Menu, Owner, Prisma, Store } from "@ssurak/db";
import { MenuService } from "src/stores/menu/menu.service";
import { PrismaService } from "src/prisma/prisma.service";
import { StorageService } from "src/storage/storage.service";
import { MenuDraftStore } from "src/stores/menu/menu-draft.store";
import type { BulkCreateMenusPayloadDto } from "src/dto/request/menu.dto";

const STORE_ID = "store-public-id";

const OWNER: Owner = {
  id: 7n,
  publicId: "owner-public-id",
  email: "owner@ssurak.dev",
  password: "hashed",
  name: "점주",
  phone: "01000000000",
  businessNumber: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const storeRow: Store = {
  id: 1n,
  publicId: STORE_ID,
  ownerId: OWNER.id,
  name: "쓱쓱식당",
  phone: null,
  address: "서울",
  addressDetail: null,
  businessHours: null,
  description: null,
  isOpen: true,
  acceptedMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const categoryRow: Category = {
  id: 11n,
  publicId: "category-public-id",
  storeId: storeRow.id,
  name: "찌개류",
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const menuRow: Menu = {
  id: 1n,
  publicId: "menu-public-id",
  categoryId: categoryRow.id,
  name: "김치찌개",
  price: 9000,
  description: null,
  imageKey: null,
  isAvailable: true,
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const payload = (
  items: BulkCreateMenusPayloadDto["items"]
): BulkCreateMenusPayloadDto => ({ items });

const menuItem = (
  overrides: Partial<BulkCreateMenusPayloadDto["items"][number]> = {}
): BulkCreateMenusPayloadDto["items"][number] => ({
  name: "김치찌개",
  price: 9000,
  isAvailable: true,
  categoryId: "category-public-id",
  ...overrides,
});

const prisma = mockDeep<PrismaService>();
const storage = mockDeep<StorageService>();
const menuDraft = mockDeep<MenuDraftStore>();

const service = new MenuService(prisma, storage, menuDraft);

/**
 * PrismaPromise는 브랜드 타입이라 평범한 Promise로는 만족시킬 수 없다.
 * mockResolvedValue는 라이브러리가 알아서 벗겨주지만 mockImplementation은 반환 타입을
 * 그대로 요구하므로, 배선용 어댑터를 한 곳에 가둔다.
 */
const prismaPromise = <T>(value: T): Prisma.PrismaPromise<T> =>
  Promise.resolve(value) as Prisma.PrismaPromise<T>;

/** createMany에 실제로 나간 data 배열. */
const createdRows = () => {
  const [args] = prisma.menu.createMany.mock.calls.at(-1)!;
  return args?.data;
};

beforeEach(() => {
  vi.clearAllMocks();

  prisma.$transaction.mockImplementation((cb) => cb(prisma));
  prisma.store.findFirstOrThrow.mockResolvedValue(storeRow);
  // 매장의 카테고리 전체를 한 번에 읽어 publicId·name 조회와 sortOrder 커서를 모두 세운다.
  prisma.category.findMany.mockResolvedValue([categoryRow]);
  prisma.category.upsert.mockResolvedValue(categoryRow);
  prisma.menu.createMany.mockResolvedValue({ count: 1 });
  prisma.menu.findFirst.mockResolvedValue(null);
  prisma.menu.findMany.mockResolvedValue([menuRow]);
});

describe("MenuService.bulkCreateMenus — 카테고리 해석", () => {
  it("카테고리를 매장 단위로 한 번만 읽는다 — 항목마다 읽으면 N+1이 된다", async () => {
    await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([menuItem(), menuItem({ name: "된장찌개" })])
    );

    expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: storeRow.id } })
    );
  });

  it("남의 매장 카테고리 ID를 실어 보내면 404로 막는다", async () => {
    // 조회를 storeId로 걸어두었으므로, 목록에 없다는 건 곧 이 매장 것이 아니라는 뜻이다.
    await expect(
      service.bulkCreateMenus(
        OWNER,
        STORE_ID,
        payload([menuItem({ categoryId: "someone-elses-category" })])
      )
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.menu.createMany).not.toHaveBeenCalled();
  });

  it("이미 있는 이름이면 만들지 않고 기존 카테고리에 붙인다", async () => {
    await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([menuItem({ categoryId: undefined, categoryName: "찌개류" })])
    );

    expect(prisma.category.upsert).not.toHaveBeenCalled();
    expect(createdRows()).toMatchObject([{ categoryId: categoryRow.id }]);
  });

  it("같은 이름의 새 카테고리가 여러 항목에 걸쳐도 한 번만 만든다", async () => {
    await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([
        menuItem({ categoryId: undefined, categoryName: "구이류" }),
        menuItem({
          name: "된장찌개",
          categoryId: undefined,
          categoryName: "구이류",
        }),
      ])
    );

    expect(prisma.category.upsert).toHaveBeenCalledTimes(1);
  });

  it("새 카테고리는 unique(storeId, name) 위에서 upsert한다", async () => {
    // 같은 매장에 동시 요청이 들어와도 카테고리가 두 벌 생기지 않아야 한다.
    await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([menuItem({ categoryId: undefined, categoryName: "구이류" })])
    );

    expect(prisma.category.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId_name: { storeId: storeRow.id, name: "구이류" } },
      })
    );
  });

  it("새 카테고리는 매장의 마지막 뒤로 겹치지 않게 이어 붙는다", async () => {
    // 커서를 메모리에서 올리지 않고 매번 최대값을 다시 읽으면 둘 다 20이 된다.
    await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([
        menuItem({ categoryId: undefined, categoryName: "구이류" }),
        menuItem({
          name: "잔치국수",
          categoryId: undefined,
          categoryName: "면류",
        }),
      ])
    );

    const sortOrders = prisma.category.upsert.mock.calls.map(
      ([args]) => args.create.sortOrder
    );

    // 기존 카테고리(찌개류)가 10이므로 그 뒤로 20, 30.
    expect(sortOrders).toEqual([20, 30]);
  });
});

describe("MenuService.bulkCreateMenus — sortOrder", () => {
  it("카테고리 안 마지막 메뉴 뒤에 요청 순서대로 이어 붙인다", async () => {
    prisma.menu.findFirst.mockResolvedValue({ ...menuRow, sortOrder: 30 });

    await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([menuItem(), menuItem({ name: "된장찌개" })])
    );

    expect(createdRows()).toMatchObject([{ sortOrder: 40 }, { sortOrder: 50 }]);
  });

  it("카테고리별 최대값을 한 번만 읽는다 — 항목마다 읽으면 전부 겹친다", async () => {
    await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([menuItem(), menuItem({ name: "된장찌개" })])
    );

    expect(prisma.menu.findFirst).toHaveBeenCalledTimes(1);
    expect(createdRows()).toMatchObject([{ sortOrder: 10 }, { sortOrder: 20 }]);
  });
});

describe("MenuService.bulkCreateMenus — 응답", () => {
  it("publicId를 직접 만들어 방금 넣은 행만 정확히 되읽는다", async () => {
    // createMany는 생성된 행을 돌려주지 않는다. 이름으로 되찾으면 동명 메뉴와 섞인다.
    await service.bulkCreateMenus(OWNER, STORE_ID, payload([menuItem()]));

    const rows = createdRows();
    const publicIds = Array.isArray(rows)
      ? rows.map((row) => row.publicId)
      : [rows?.publicId];

    expect(publicIds[0]).toBeTypeOf("string");
    expect(prisma.menu.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: { in: publicIds } } })
    );
  });

  it("findMany 결과 순서와 무관하게 요청 순서로 돌려준다", async () => {
    const second = { ...menuRow, publicId: "second", name: "된장찌개" };
    prisma.menu.createMany.mockImplementation((args) => {
      const data = args?.data ?? [];
      const rows = Array.isArray(data) ? data : [data];
      // DB가 역순으로 돌려주는 상황을 흉내낸다.
      prisma.menu.findMany.mockResolvedValue([
        { ...second, publicId: String(rows[1]?.publicId) },
        { ...menuRow, publicId: String(rows[0]?.publicId) },
      ]);
      return prismaPromise({ count: 2 });
    });

    const created = await service.bulkCreateMenus(
      OWNER,
      STORE_ID,
      payload([menuItem(), menuItem({ name: "된장찌개" })])
    );

    expect(created.map((menu) => menu.name)).toEqual(["김치찌개", "된장찌개"]);
  });

  it("전부 한 트랜잭션에서 처리한다", async () => {
    await service.bulkCreateMenus(OWNER, STORE_ID, payload([menuItem()]));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
