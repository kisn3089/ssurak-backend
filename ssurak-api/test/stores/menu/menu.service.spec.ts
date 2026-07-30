import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { HttpException, NotFoundException } from "@nestjs/common";
import { Category, Menu } from "@ssurak/db";
import { MenuService } from "src/stores/menu/menu.service";
import { PrismaService } from "src/prisma/prisma.service";
import { StorageService } from "src/storage/storage.service";
import type { CreateMenuPayloadDto } from "src/dto/request/menu.dto";

const STORE_ID = "store-public-id";
const OWNER = "owner-public-id";
const TMP_KEY = "tmp/owner-public-id/abc123";

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
  requiredOptions: null,
  customOptions: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const prisma = mockDeep<PrismaService>();
const storage = mockDeep<StorageService>();

const service = new MenuService(prisma, storage);

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
  prisma.menu.findFirstOrThrow.mockResolvedValue({
    ...menuRow,
    category: { publicId: "category-public-id" },
  } as never);
  // 카테고리 맨 뒤 sortOrder 조회 — 기본값은 "메뉴 없음".
  prisma.menu.findFirst.mockResolvedValue(null);
  prisma.menu.findMany.mockResolvedValue([menuRow]);
  // $transaction(callback) 형태를 콜백에 mock client(tx)를 그대로 넘겨 실행한다.
  prisma.$transaction.mockImplementation((cb) => cb(prisma));
  prisma.$executeRaw.mockResolvedValue(0);
  prisma.$queryRaw.mockResolvedValue([]);
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
      STORE_ID,
      OWNER,
      createPayload({ imageKey: TMP_KEY })
    );

    expect(storage.promoteMenuImage).toHaveBeenCalledWith(TMP_KEY, OWNER);
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
      service.createMenu(STORE_ID, OWNER, createPayload({ imageKey: TMP_KEY }))
    ).rejects.toThrowError(NotFoundException);

    expect(prisma.menu.create).not.toHaveBeenCalled();
  });

  it("이미지 없이 생성하면 확정을 시도하지 않고 null로 저장한다", async () => {
    await service.createMenu(STORE_ID, OWNER, createPayload());

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

    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
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
    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
      name: "새 이름",
    });

    const [[arg]] = prisma.menu.update.mock.calls;
    expect(arg.data).not.toHaveProperty("imageKey");
    expect(storage.promoteMenuImage).not.toHaveBeenCalled();
  });

  it("imageKey를 null로 보내면 이미지 연결만 해제한다", async () => {
    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
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
    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
      categoryId: "category-public-id", // 현재 카테고리와 동일
    });

    const [arg] = prisma.menu.update.mock.calls.at(-1)!;
    expect(arg.data).not.toHaveProperty("sortOrder");
    expect(arg.data).not.toHaveProperty("category");
  });

  it("다른 카테고리로 옮기면 그 카테고리 맨 뒤(+10)에 놓는다", async () => {
    // 원래 순서를 들고 오면 새 카테고리에서 자리가 겹친다.
    prisma.menu.findFirst.mockResolvedValue({ ...menuRow, sortOrder: 50 });

    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
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

  it("재정렬 전에 store 행을 FOR UPDATE로 잠근다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(STORE_ID, payload);

    // 락이 없으면 동시 재정렬이 서로의 재번호를 덮어쓴다.
    const [sql] = prisma.$queryRaw.mock.calls[0];
    expect("strings" in sql && sql.strings.join("")).toContain("FOR UPDATE");
    expect("values" in sql && sql.values).toEqual([STORE_ID]);
  });

  it("요청 순서대로 10, 20... 을 CASE 한 방으로 다시 매긴다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(STORE_ID, payload);

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

  it("현재 메뉴 집합과 다르면(누락) 409로 거절하고 아무것도 쓰지 않는다", async () => {
    // 다른 곳에서 메뉴가 추가됐다 = 클라이언트 목록이 stale하다.
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
      { ...menuRow, publicId: "m3" },
    ]);

    await expect(service.reorderMenus(STORE_ID, payload)).rejects.toThrowError(
      HttpException
    );

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("현재 집합에 없는 메뉴가 섞이면 409로 거절한다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "zzz" },
    ]);

    await expect(service.reorderMenus(STORE_ID, payload)).rejects.toThrowError(
      HttpException
    );

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("소프트 삭제된 메뉴는 정렬 대상에서 제외한다", async () => {
    prisma.menu.findMany.mockResolvedValue([
      { ...menuRow, publicId: "m1" },
      { ...menuRow, publicId: "m2" },
    ]);

    await service.reorderMenus(STORE_ID, payload);

    const [arg] = prisma.menu.findMany.mock.calls[0];
    expect(arg!.where).toMatchObject({
      category: { publicId: payload.categoryId },
      deletedAt: null,
    });
  });
});
