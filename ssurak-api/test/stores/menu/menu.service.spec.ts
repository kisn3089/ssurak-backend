import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { NotFoundException } from "@nestjs/common";
import { MenuService } from "src/stores/menu/menu.service";
import { PrismaService } from "src/prisma/prisma.service";
import { StorageService } from "src/storage/storage.service";
import type { CreateMenuPayloadDto } from "src/dto/request/menu.dto";

const STORE_ID = "store-public-id";
const OWNER = "owner-public-id";
const TMP_KEY = "tmp/owner-public-id/abc123";

const prisma = mockDeep<PrismaService>();
const storage = mockDeep<StorageService>();

const service = new MenuService(prisma, storage);

const createPayload = (
  overrides: Partial<CreateMenuPayloadDto> = {}
): CreateMenuPayloadDto =>
  ({
    name: "아메리카노",
    price: 4500,
    categoryId: "category-public-id",
    isAvailable: true,
    ...overrides,
  }) as CreateMenuPayloadDto;

beforeEach(() => {
  prisma.category.findFirstOrThrow.mockResolvedValue({ id: 1n } as never);
  prisma.menu.create.mockResolvedValue({} as never);
  prisma.menu.update.mockResolvedValue({} as never);
  storage.promoteMenuImage.mockReset();
  prisma.menu.create.mockClear();
  prisma.menu.update.mockClear();
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
});
