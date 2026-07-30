import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { HttpException } from "@nestjs/common";
import { Category, Owner, Store } from "@ssurak/db";
import { CategoryService } from "src/stores/menu/category.service";
import { PrismaService } from "src/prisma/prisma.service";

const STORE_ID = "store-public-id";
const CATEGORY_ID = "category-public-id";

// Prisma mock 반환값 — 테스트는 호출 인자만 검증하므로 shape만 채운다.
const owner: Owner = {
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

const categoryRow: Category = {
  id: 1n,
  publicId: CATEGORY_ID,
  storeId: 1n,
  name: "커피",
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const storeRow: Store = {
  id: 1n,
  publicId: STORE_ID,
  ownerId: owner.id,
  name: "싸락 1호점",
  phone: null,
  address: "서울시 어딘가",
  addressDetail: null,
  businessHours: null,
  description: null,
  isOpen: true,
  acceptedMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** 삭제 경로는 남은 메뉴 수까지 세어 온다. */
type CategoryWithMenuCount = Category & { _count: { menus: number } };

const categoryWithMenuCount = (menus: number): CategoryWithMenuCount => ({
  ...categoryRow,
  _count: { menus },
});

const prisma = mockDeep<PrismaService>();
const service = new CategoryService(prisma);

/** 매장 + 소유자까지 좁혀진 where 조각. 모든 조회가 이걸 달고 나가야 한다. */
const ownedStoreScope = {
  store: { publicId: STORE_ID, owner: { id: owner.id } },
};

beforeEach(() => {
  prisma.category.create.mockResolvedValue(categoryRow);
  prisma.category.update.mockResolvedValue(categoryRow);
  prisma.category.delete.mockResolvedValue(categoryRow);
  prisma.category.findMany.mockResolvedValue([categoryRow]);
  prisma.category.findFirst.mockResolvedValue(null);
  prisma.category.findFirstOrThrow.mockResolvedValue(categoryWithMenuCount(0));
  // $transaction(callback) 형태를 콜백에 mock client(tx)를 그대로 넘겨 실행한다.
  prisma.$transaction.mockImplementation((cb) => cb(prisma));
  prisma.$executeRaw.mockResolvedValue(0);
  // GET_LOCK 획득 성공이 기본값. 0이면 다른 재정렬이 진행 중이라는 뜻이다.
  prisma.$queryRaw.mockResolvedValue([{ acquired: 1 }]);

  // 생성 전 소유권 확인 — 기본값은 "내 매장이 맞다".
  prisma.store.findFirstOrThrow.mockResolvedValue(storeRow);

  prisma.$executeRaw.mockClear();
  prisma.$queryRaw.mockClear();
  prisma.store.findFirstOrThrow.mockClear();
  prisma.category.create.mockClear();
  prisma.category.update.mockClear();
  prisma.category.delete.mockClear();
  prisma.category.findMany.mockClear();
  prisma.category.findFirst.mockClear();
});

describe("CategoryService.createCategory", () => {
  it("sortOrder를 생략하면 매장 마지막 카테고리 뒤(+10)에 붙인다", async () => {
    prisma.category.findFirst.mockResolvedValue({
      ...categoryRow,
      sortOrder: 30,
    });

    await service.createCategory(owner, STORE_ID, { name: "디저트" });

    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 40 }),
      })
    );
  });

  it("카테고리가 하나도 없으면 첫 순서를 10으로 시작한다", async () => {
    prisma.category.findFirst.mockResolvedValue(null);

    await service.createCategory(owner, STORE_ID, { name: "커피" });

    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 10 }),
      })
    );
  });

  /**
   * 생성은 where로 좁힐 대상이 없어 조회 계열의 소유자 필터가 걸리지 않는다.
   * 가드를 안 타는 호출에서 남의 매장에 카테고리가 꽂히지 않으려면 여기서 막아야 한다.
   */
  it("소유자의 매장인지 먼저 확인한다", async () => {
    await service.createCategory(owner, STORE_ID, { name: "커피" });

    const [arg] = prisma.store.findFirstOrThrow.mock.calls.at(-1)!;
    expect(arg!.where).toMatchObject({
      publicId: STORE_ID,
      owner: { id: owner.id },
    });
  });

  it("남의 매장이면 생성하지 않는다", async () => {
    prisma.store.findFirstOrThrow.mockRejectedValue(new Error("P2025"));

    await expect(
      service.createCategory(owner, STORE_ID, { name: "커피" })
    ).rejects.toThrowError();

    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("확인된 매장의 내부 id로 connect한다", async () => {
    prisma.store.findFirstOrThrow.mockResolvedValue({ ...storeRow, id: 42n });

    await service.createCategory(owner, STORE_ID, { name: "커피" });

    // 방금 확인한 행을 그대로 연결한다 — connect가 소유권 검증에 의존한다는 게 드러난다.
    const [arg] = prisma.category.create.mock.calls.at(-1)!;
    expect(arg.data.store).toEqual({ connect: { id: 42n } });
  });
});

describe("CategoryService.reorderCategories", () => {
  const payload = { categoryIds: ["c1", "c2", "c3"] };

  const mockCurrent = (...publicIds: string[]) =>
    prisma.category.findMany.mockResolvedValue(
      publicIds.map((publicId) => ({ ...categoryRow, publicId }))
    );

  it("매장별 어드바이저리 락을 잡고 끝나면 해제한다", async () => {
    mockCurrent("c1", "c2", "c3");

    await service.reorderCategories(owner, STORE_ID, payload);

    // 락이 없으면 동시 재정렬이 서로의 재번호를 덮어쓴다. 다만 store 행을 잠그면
    // 그 행의 FK 자식(order 등) INSERT까지 같이 막히므로 이름만 잠근다.
    const [acquire] = prisma.$queryRaw.mock.calls[0];
    expect("strings" in acquire && acquire.strings.join("")).toContain(
      "GET_LOCK"
    );
    expect("values" in acquire && acquire.values).toEqual([
      `reorder:${STORE_ID}`,
      3,
    ]);

    const [release] = prisma.$queryRaw.mock.calls.at(-1)!;
    expect("strings" in release && release.strings.join("")).toContain(
      "RELEASE_LOCK"
    );
  });

  it("락을 못 잡으면 409로 돌려보내고 아무것도 쓰지 않는다", async () => {
    mockCurrent("c1", "c2", "c3");
    prisma.$queryRaw.mockResolvedValue([{ acquired: 0 }]);

    await expect(
      service.reorderCategories(owner, STORE_ID, payload)
    ).rejects.toThrowError(HttpException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("요청 순서대로 10, 20, 30을 CASE 한 방으로 다시 매긴다", async () => {
    mockCurrent("c1", "c2", "c3");

    await service.reorderCategories(owner, STORE_ID, payload);

    // N건 개별 update는 트랜잭션 안에서 왕복이 N번 발생한다.
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

    const [sql] = prisma.$executeRaw.mock.calls[0];
    expect("values" in sql && sql.values).toEqual([
      "c1",
      10,
      "c2",
      20,
      "c3",
      30,
      ...payload.categoryIds,
    ]);
  });

  it("같은 배열을 두 번 보내도 같은 순서가 된다(멱등)", async () => {
    mockCurrent("c1", "c2", "c3");

    await service.reorderCategories(owner, STORE_ID, payload);
    await service.reorderCategories(owner, STORE_ID, payload);

    const [first] = prisma.$executeRaw.mock.calls[0];
    const [second] = prisma.$executeRaw.mock.calls[1];
    expect("values" in first && first.values).toEqual(
      "values" in second && second.values
    );
  });

  it("현재 집합에 없는 카테고리가 빠지면 409로 거절하고 아무것도 쓰지 않는다", async () => {
    // 다른 탭에서 카테고리를 추가했다 = 클라이언트 목록이 stale하다.
    mockCurrent("c1", "c2", "c3", "c4");

    await expect(
      service.reorderCategories(owner, STORE_ID, payload)
    ).rejects.toThrowError(HttpException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("남의 매장 카테고리를 섞어 보내도 집합 검사에서 걸린다", async () => {
    mockCurrent("c1", "c2", "other-store-category");

    await expect(
      service.reorderCategories(owner, STORE_ID, payload)
    ).rejects.toThrowError(HttpException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("CategoryService 조회 스코프", () => {
  it("목록은 소유자까지 좁힌 where로 표시 순서대로 조회한다", async () => {
    await service.getCategoryList(owner, STORE_ID);

    const arg = prisma.category.findMany.mock.calls.at(-1)![0]!;
    expect(arg.where).toMatchObject(ownedStoreScope);
    expect(arg.orderBy).toEqual([{ sortOrder: "asc" }, { id: "asc" }]);
  });

  it("단건 조회도 남의 매장에 닿지 않도록 소유자를 조건에 건다", async () => {
    await service.getCategoryUnique(owner, STORE_ID, CATEGORY_ID);

    const arg = prisma.category.findFirstOrThrow.mock.calls.at(-1)![0]!;
    expect(arg.where).toMatchObject({
      publicId: CATEGORY_ID,
      ...ownedStoreScope,
    });
  });

  it("응답 omit에서 내부 id와 storeId를 모두 제거한다", async () => {
    await service.getCategoryList(owner, STORE_ID);

    const arg = prisma.category.findMany.mock.calls.at(-1)![0]!;
    // 관계(menus)는 omit 대상이 아니다 — include하지 않으므로 애초에 실리지 않는다.
    expect(arg.omit).toEqual({ id: true, storeId: true });
  });
});

describe("CategoryService.deleteCategory", () => {
  it("메뉴가 남아 있으면 409로 막고 삭제하지 않는다", async () => {
    // 소프트 삭제된 메뉴도 FK를 붙들고 있으므로 _count는 필터 없이 센다.
    prisma.category.findFirstOrThrow.mockResolvedValue(
      categoryWithMenuCount(1)
    );

    await expect(
      service.deleteCategory(owner, STORE_ID, CATEGORY_ID)
    ).rejects.toThrowError(HttpException);

    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it("메뉴가 없으면 조회한 id로 삭제한다", async () => {
    await service.deleteCategory(owner, STORE_ID, CATEGORY_ID);

    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: categoryRow.id },
    });
  });
});

describe("CategoryService.partialUpdateCategory", () => {
  it("수정도 소유자 스코프를 건 where로 나간다", async () => {
    await service.partialUpdateCategory(owner, STORE_ID, CATEGORY_ID, {
      name: "새 이름",
    });

    const [arg] = prisma.category.update.mock.calls.at(-1)!;
    expect(arg.where).toMatchObject({
      publicId: CATEGORY_ID,
      ...ownedStoreScope,
    });
    expect(arg.data).toEqual({ name: "새 이름" });
  });
});
