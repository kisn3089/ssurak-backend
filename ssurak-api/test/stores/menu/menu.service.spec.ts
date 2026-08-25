import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { HttpException, NotFoundException } from "@nestjs/common";
import { Category, Menu, Owner, Prisma } from "@ssurak/db";
import { MenuService } from "src/stores/menu/menu.service";
import { PrismaService } from "src/prisma/prisma.service";
import { StorageService } from "src/storage/storage.service";
import { MenuDraftStore } from "src/stores/menu/menu-draft.store";
import type { CreateMenuPayloadDto } from "src/dto/request/menu.dto";
import { MENU_RETENTION_MS } from "src/stores/menu/menu-retention.const";

const STORE_ID = "store-public-id";
const TMP_KEY = "tmp/owner-public-id/abc123";

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

/** 매장 + 소유자까지 좁혀진 where 조각. 메뉴 조회가 모두 이걸 달고 나가야 한다. */
const ownedStoreScope = {
  store: { publicId: STORE_ID, owner: { id: OWNER.id } },
};

// Prisma mock 반환값 — 테스트는 호출 인자만 검증하므로 shape만 채운다.
const categoryRow: Category = {
  id: 1n,
  publicId: "category-public-id",
  storeId: 1n,
  name: "커피",
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const menuRow: Menu = {
  id: 1n,
  publicId: "menu-public-id",
  categoryId: 1n,
  name: "아메리카노",
  price: 4500,
  description: null,
  imageKey: null,
  isAvailable: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

/** 카테고리 이동 판정은 현재 소속 카테고리의 publicId만 골라 온다. */
type MenuWithCategory = Menu & { category: { publicId: string } };

const menuInCategory = (categoryPublicId: string): MenuWithCategory => ({
  ...menuRow,
  category: { publicId: categoryPublicId },
});

const prisma = mockDeep<PrismaService>();
const storage = mockDeep<StorageService>();

const service = new MenuService(prisma, storage, mockDeep<MenuDraftStore>());

const createPayload = (
  overrides: Partial<CreateMenuPayloadDto> = {}
): CreateMenuPayloadDto => ({
  name: "아메리카노",
  price: 4500,
  categoryId: "category-public-id",
  isAvailable: true,
  ...overrides,
});

beforeEach(() => {
  prisma.category.findFirstOrThrow.mockResolvedValue(categoryRow);
  prisma.menu.create.mockResolvedValue(menuRow);
  prisma.menu.update.mockResolvedValue(menuRow);
  // 수정 시 현재 카테고리 조회 — 기본값은 "카테고리 이동 없음".
  prisma.menu.findFirstOrThrow.mockResolvedValue(
    menuInCategory("category-public-id")
  );
  // 카테고리 맨 뒤 sortOrder 조회 — 기본값은 "메뉴 없음".
  prisma.menu.findFirst.mockResolvedValue(null);
  prisma.menu.findMany.mockResolvedValue([menuRow]);
  // $transaction(callback) 형태를 콜백에 mock client(tx)를 그대로 넘겨 실행한다.
  prisma.$transaction.mockImplementation((cb) => cb(prisma));
  prisma.$executeRaw.mockResolvedValue(0);
  // GET_LOCK 획득 성공이 기본값. 0이면 다른 재정렬이 진행 중이라는 뜻이다.
  prisma.$queryRaw.mockResolvedValue([{ acquired: 1 }]);
  storage.promoteMenuImage.mockReset();
  prisma.menu.create.mockClear();
  prisma.menu.update.mockClear();
  prisma.menu.updateMany.mockClear();
  prisma.menu.findFirst.mockClear();
  prisma.menu.findMany.mockClear();
  prisma.$executeRaw.mockClear();
  prisma.$queryRaw.mockClear();
});

describe("MenuService.createMenu", () => {
  it("임시 키를 정식 경로로 확정한 뒤 그 값을 저장한다", async () => {
    storage.promoteMenuImage.mockResolvedValue("menu/abc123");

    await service.createMenu(
      OWNER,
      STORE_ID,
      createPayload({ imageKey: TMP_KEY })
    );

    expect(storage.promoteMenuImage).toHaveBeenCalledWith(
      TMP_KEY,
      OWNER.publicId
    );
    expect(prisma.menu.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageKey: "menu/abc123" }),
      })
    );
  });

  it("S3 확정이 실패하면 메뉴 레코드를 만들지 않는다", async () => {
    // 순서 회귀 방지: DB write가 먼저였다면 존재하지 않는 이미지를 가리키는
    // 메뉴가 남는다. 고아 객체보다 깨진 참조가 나쁘다.
    storage.promoteMenuImage.mockRejectedValue(new NotFoundException());

    await expect(
      service.createMenu(OWNER, STORE_ID, createPayload({ imageKey: TMP_KEY }))
    ).rejects.toThrowError(NotFoundException);

    expect(prisma.menu.create).not.toHaveBeenCalled();
  });

  it("이미지 없이 생성하면 확정을 시도하지 않고 null로 저장한다", async () => {
    await service.createMenu(OWNER, STORE_ID, createPayload());

    expect(storage.promoteMenuImage).not.toHaveBeenCalled();
    expect(prisma.menu.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageKey: null }),
      })
    );
  });
});

describe("MenuService.partialUpdateMenu", () => {
  it("이미지를 교체해도 구 객체 삭제를 시도하지 않는다", async () => {
    // 과거 주문의 menuImageUrl 스냅샷이 구 객체를 가리키고 있다.
    // 지우면 주문 내역의 썸네일이 404가 된다.
    storage.promoteMenuImage.mockResolvedValue("menu/newkey");

    await service.partialUpdateMenu(OWNER, STORE_ID, "menu-public-id", {
      imageKey: TMP_KEY,
    });

    expect(prisma.menu.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageKey: "menu/newkey" }),
      })
    );
    // mockDeep은 어떤 속성이든 만들어내므로 실제 클래스를 본다.
    // 삭제 메서드가 생기는 순간 이 방침이 깨지므로 존재 자체를 막는다.
    const methods = Object.getOwnPropertyNames(StorageService.prototype);
    expect(methods.filter((name) => /delete|remove/i.test(name))).toEqual([]);
  });

  it("imageKey를 보내지 않으면 이미지를 건드리지 않는다", async () => {
    await service.partialUpdateMenu(OWNER, STORE_ID, "menu-public-id", {
      name: "새 이름",
    });

    const [[arg]] = prisma.menu.update.mock.calls;
    expect(arg.data).not.toHaveProperty("imageKey");
    expect(storage.promoteMenuImage).not.toHaveBeenCalled();
  });

  it("imageKey를 null로 보내면 이미지 연결만 해제한다", async () => {
    await service.partialUpdateMenu(OWNER, STORE_ID, "menu-public-id", {
      imageKey: null,
    });

    expect(storage.promoteMenuImage).not.toHaveBeenCalled();
    expect(prisma.menu.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageKey: null }),
      })
    );
  });

  it("같은 카테고리를 그대로 보내면 순서를 건드리지 않는다", async () => {
    await service.partialUpdateMenu(OWNER, STORE_ID, "menu-public-id", {
      categoryId: "category-public-id", // 현재 카테고리와 동일
    });

    const [arg] = prisma.menu.update.mock.calls.at(-1)!;
    expect(arg.data).not.toHaveProperty("sortOrder");
    expect(arg.data).not.toHaveProperty("category");
  });

  it("다른 카테고리로 옮기면 그 카테고리 맨 뒤(+10)에 놓는다", async () => {
    // 원래 순서를 들고 오면 새 카테고리에서 자리가 겹친다.
    prisma.menu.findFirst.mockResolvedValue({ ...menuRow, sortOrder: 50 });

    await service.partialUpdateMenu(OWNER, STORE_ID, "menu-public-id", {
      categoryId: "other-category-id",
    });

    const [arg] = prisma.menu.update.mock.calls.at(-1)!;
    expect(arg.data).toMatchObject({
      category: { connect: { publicId: "other-category-id" } },
      sortOrder: 60,
    });
  });
});

describe("MenuService.reorderMenus", () => {
  const payload = { categoryId: "category-public-id", menuIds: ["m1", "m2"] };

  it("매장별 어드바이저리 락을 잡고 끝나면 해제한다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(OWNER, STORE_ID, payload);

    // store 행을 FOR UPDATE로 잡으면 그 행의 FK 자식(order 등) INSERT까지 막힌다.
    const [acquire] = prisma.$queryRaw.mock.calls[0];
    expect("strings" in acquire && acquire.strings.join("")).toContain(
      "GET_LOCK"
    );
    expect("values" in acquire && acquire.values).toEqual([
      `reorder:${STORE_ID}`,
      3,
    ]);

    // 해제를 빠뜨리면 커넥션이 풀로 돌아간 뒤에도 락이 남아 이후 재정렬이 전부 막힌다.
    const [release] = prisma.$queryRaw.mock.calls.at(-1)!;
    expect("strings" in release && release.strings.join("")).toContain(
      "RELEASE_LOCK"
    );
  });

  it("락 대기분을 더한 트랜잭션 timeout을 넘긴다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(OWNER, STORE_ID, payload);

    // 기본값 5초를 그대로 쓰면 3초를 기다린 요청에 2초만 남아 P2028이 나고,
    // 의도한 409 대신 400(PRISMA_ERROR)으로 응답이 바뀐다.
    const [, options] = prisma.$transaction.mock.calls.at(-1)!;
    expect(options).toEqual({ timeout: 8_000 });
  });

  it("락을 못 잡으면 409로 돌려보내고 아무것도 쓰지 않는다", async () => {
    // GET_LOCK 타임아웃 = 다른 재정렬이 처리 중.
    prisma.$queryRaw.mockResolvedValue([{ acquired: 0 }]);

    await expect(
      service.reorderMenus(OWNER, STORE_ID, payload)
    ).rejects.toThrowError(HttpException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("요청 순서대로 10, 20... 을 CASE 한 방으로 다시 매긴다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(OWNER, STORE_ID, payload);

    // N건 개별 update는 트랜잭션 안에서 왕복이 N번 발생한다.
    expect(prisma.menu.update).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

    const [sql] = prisma.$executeRaw.mock.calls[0];
    expect("values" in sql && sql.values).toEqual([
      "m1",
      10,
      "m2",
      20,
      ...payload.menuIds,
    ]);
  });

  it("재번호와 함께 updated_at을 직접 찍는다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(OWNER, STORE_ID, payload);

    // @updatedAt은 Prisma 애플리케이션 레벨이고 컬럼에도 ON UPDATE가 없어서,
    // raw UPDATE가 직접 안 찍으면 재정렬 응답의 updatedAt이 옛 값으로 남는다.
    const [sql] = prisma.$executeRaw.mock.calls[0];
    expect("strings" in sql && sql.strings.join("")).toContain(
      "updated_at = NOW(3)"
    );
  });

  it("재정렬 결과는 sortOrder 동률 시 id로 결정적 정렬한다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(OWNER, STORE_ID, payload);

    const [resultQuery] = prisma.menu.findMany.mock.calls.at(-1)!;
    expect(resultQuery!.orderBy).toEqual([{ sortOrder: "asc" }, { id: "asc" }]);
  });

  it("현재 메뉴 집합과 다르면(누락) 409로 거절하고 아무것도 쓰지 않는다", async () => {
    // 다른 곳에서 메뉴가 추가됐다 = 클라이언트 목록이 stale하다.
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
      { ...menuRow, publicId: "m3" },
    ]);

    await expect(
      service.reorderMenus(OWNER, STORE_ID, payload)
    ).rejects.toThrowError(HttpException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("현재 집합에 없는 메뉴가 섞이면 409로 거절한다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "zzz" },
    ]);

    await expect(
      service.reorderMenus(OWNER, STORE_ID, payload)
    ).rejects.toThrowError(HttpException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("소프트 삭제된 메뉴는 정렬 대상에서 제외한다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(OWNER, STORE_ID, payload);

    const [arg] = prisma.menu.findMany.mock.calls[0];
    expect(arg!.where).toMatchObject({
      category: { publicId: payload.categoryId },
      deletedAt: null,
    });
  });

  it("재정렬 대상 카테고리를 소유자까지 좁혀 검증한다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(OWNER, STORE_ID, payload);

    const [arg] = prisma.category.findFirstOrThrow.mock.calls.at(-1)!;
    expect(arg!.where).toMatchObject({
      publicId: payload.categoryId,
      ...ownedStoreScope,
    });
  });
});

/**
 * 가드는 라우트 레벨이라 가드를 빠뜨린 라우트나 서비스 간 내부 호출은 걸러내지 못한다.
 * 메뉴를 짚는 모든 경로가 where에도 소유자를 달고 나가야 테넌트 경계가 두 겹이 된다.
 */
describe("MenuService 소유자 스코프", () => {
  it("단건 조회가 소유자까지 좁힌다", async () => {
    await service.getMenuUnique(OWNER, STORE_ID, "menu-public-id");

    const [arg] = prisma.menu.findFirstOrThrow.mock.calls.at(-1)!;
    expect(arg!.where).toMatchObject({
      publicId: "menu-public-id",
      category: ownedStoreScope,
    });
  });

  it("소프트 삭제가 소유자까지 좁힌다", async () => {
    await service.softDeleteMenu(OWNER, STORE_ID, "menu-public-id");

    const [arg] = prisma.menu.update.mock.calls.at(-1)!;
    expect(arg.where).toMatchObject({
      publicId: "menu-public-id",
      category: ownedStoreScope,
    });
  });

  it("수정이 소유자까지 좁힌다", async () => {
    await service.partialUpdateMenu(OWNER, STORE_ID, "menu-public-id", {
      name: "새 이름",
    });

    const [arg] = prisma.menu.update.mock.calls.at(-1)!;
    expect(arg.where).toMatchObject({
      publicId: "menu-public-id",
      category: ownedStoreScope,
    });
  });
});

/**
 * 복구는 배치가 이미지를 회수하기 전(보관 기간 내)에만 허용해야 한다.
 * 기간이 지난 메뉴를 되살리면 존재하지 않는 객체를 가리키는 imageKey가 함께 살아난다.
 */
describe("MenuService 복구", () => {
  it("보관 기간 내 삭제만 복구 대상으로 좁힌다", async () => {
    const before = Date.now();

    await service.restoreMenu(OWNER, STORE_ID, "menu-public-id");

    const [arg] = prisma.menu.update.mock.calls.at(-1)!;
    expect(arg.data).toEqual({ deletedAt: null });
    expect(arg.where).toMatchObject({
      publicId: "menu-public-id",
      category: ownedStoreScope,
    });

    const { gte } = arg.where.deletedAt as { gte: Date };
    expect(gte.getTime()).toBeGreaterThanOrEqual(
      before - MENU_RETENTION_MS - 1_000
    );
    expect(gte.getTime()).toBeLessThanOrEqual(Date.now() - MENU_RETENTION_MS);
  });

  it("복구 목록도 보관 기간 내 삭제만, 매장·소유자까지 좁혀 조회한다", async () => {
    const before = Date.now();

    await service.getRestorableMenus(OWNER, STORE_ID);

    const [arg] = prisma.menu.findMany.mock.calls.at(-1)!;
    expect(arg!.where).toMatchObject({ category: ownedStoreScope });
    expect(arg!.orderBy).toEqual({ deletedAt: "desc" });

    const { gte } = arg!.where!.deletedAt as { gte: Date };
    expect(gte.getTime()).toBeGreaterThanOrEqual(
      before - MENU_RETENTION_MS - 1_000
    );
    expect(gte.getTime()).toBeLessThanOrEqual(Date.now() - MENU_RETENTION_MS);
  });

  it("대상이 없으면(기간 초과 포함) 404로 안내한다", async () => {
    prisma.menu.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("not found", {
        code: "P2025",
        clientVersion: "6",
      })
    );

    await expect(
      service.restoreMenu(OWNER, STORE_ID, "menu-public-id")
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
