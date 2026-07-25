import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { NotFoundException } from "@nestjs/common";
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
  prisma.menu.findFirstOrThrow.mockResolvedValue(menuRow);
  // 겹치는 sortOrder 없음 = 재조정 스킵을 기본값으로 둔다.
  prisma.menu.findFirst.mockResolvedValue(null);
  // $transaction(callback) 형태를 콜백에 mock client(tx)를 그대로 넘겨 실행한다.
  prisma.$transaction.mockImplementation((cb) => cb(prisma));
  prisma.$executeRaw.mockResolvedValue(0);
  storage.promoteMenuImage.mockReset();
  prisma.menu.create.mockClear();
  prisma.menu.update.mockClear();
  prisma.menu.updateMany.mockClear();
  prisma.menu.findFirst.mockClear();
  prisma.$executeRaw.mockClear();
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

  it("겹치는 sortOrder가 없으면 요청 값을 그대로 반영한다", async () => {
    prisma.menu.findFirst.mockResolvedValue(null);

    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
      categoryId: "category-public-id",
      sortOrder: 25,
    });

    expect(prisma.menu.updateMany).not.toHaveBeenCalled();
    const [arg] = prisma.menu.update.mock.calls.at(-1)!;
    expect(arg.data).toMatchObject({ sortOrder: 25 });
  });

  it("sortOrder가 겹치면 겹친 메뉴를 다음 슬롯 중간값으로 밀어낸다", async () => {
    prisma.menu.findFirst
      .mockResolvedValueOnce({ ...menuRow, publicId: "dup-id" }) // 충돌 메뉴
      .mockResolvedValueOnce({ ...menuRow, sortOrder: 30 }); // 바로 위 메뉴

    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
      categoryId: "category-public-id",
      sortOrder: 10,
    });

    // floor((10 + 30) / 2) = 20 으로 충돌 메뉴만 이동
    expect(prisma.menu.update).toHaveBeenCalledWith({
      where: { publicId: "dup-id" },
      data: { sortOrder: 20 },
    });
    expect(prisma.menu.updateMany).not.toHaveBeenCalled();
  });

  it("중간 정수 자리가 없으면 뒤쪽을 순번 기반 재번호(raw)로 재간격한다", async () => {
    const collidedSortOrder = 10;
    prisma.menu.findFirst
      .mockResolvedValueOnce({ ...menuRow, publicId: "dup-id" }) // 충돌 메뉴
      .mockResolvedValueOnce({ ...menuRow, sortOrder: 11 }); // 인접해 간격 없음 → fallback

    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
      categoryId: "category-public-id",
      sortOrder: collidedSortOrder,
    });

    // 재번호는 단일 raw UPDATE로 처리한다(updateMany 아님).
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.menu.updateMany).not.toHaveBeenCalled();

    // 파라미터 순서: categoryPublicId, menuId, sortOrder, sortOrder, STEP
    const [sql] = prisma.$executeRaw.mock.calls[0];
    expect("values" in sql).toBe(true);
    if ("values" in sql) {
      expect(sql.values).toEqual([
        "category-public-id",
        "menu-public-id",
        collidedSortOrder,
        collidedSortOrder,
        10,
      ]);
    }
  });

  it("재간격 시 충돌 메뉴 개별 update 없이 본체(M)만 update한다", async () => {
    const collidedSortOrder = 10;
    prisma.menu.findFirst
      .mockResolvedValueOnce({ ...menuRow, publicId: "dup-id" }) // 충돌 메뉴
      .mockResolvedValueOnce({ ...menuRow, sortOrder: 11 }); // 인접해 간격 없음 → fallback

    await service.partialUpdateMenu(STORE_ID, "menu-public-id", OWNER, {
      categoryId: "category-public-id",
      sortOrder: collidedSortOrder,
    });

    // 충돌 메뉴는 raw 재번호에 포함되므로, menu.update는 본체(M) 1번만 호출된다.
    expect(prisma.menu.update).toHaveBeenCalledTimes(1);
    const [mainUpdateArg] = prisma.menu.update.mock.calls[0];
    expect(mainUpdateArg.where).toMatchObject({ publicId: "menu-public-id" });
    expect(mainUpdateArg.data).toMatchObject({ sortOrder: collidedSortOrder });
  });
});
