import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Redis } from "ioredis";
import type { Owner } from "@ssurak/db";
import type { MenuExtraction } from "@ssurak/schema";
import { PrismaService } from "src/prisma/prisma.service";
import { MenuDraftService } from "src/stores/menu/menu-draft.service";
import { MenuVisionClient } from "src/stores/menu/menu-vision.client";
import sharp from "sharp";

const STORE_ID = "store-public-id";
const HOURLY_LIMIT = 10;

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

const EXTRACTION: MenuExtraction = {
  items: [
    {
      name: "김치찌개",
      price: 9000,
      description: null,
      categoryName: "찌개류",
    },
  ],
  unreadableCount: 0,
};

/** OCR 전처리를 통과할 수 있는 최소 크기의 실제 JPEG. */
const menuPhoto = (): Promise<Buffer> =>
  sharp({
    create: {
      width: 1000,
      height: 800,
      channels: 3,
      background: { r: 250, g: 250, b: 250 },
    },
  })
    .jpeg()
    .toBuffer();

const prisma = mockDeep<PrismaService>();
const vision = mockDeep<MenuVisionClient>();
const redis = mockDeep<Redis>();
const config = mockDeep<ConfigService>();

// 상한은 생성자에서 한 번 읽힌다. 인스턴스를 모듈 로드 시점에 만들면
// config mock이 세팅되기 전 값이 굳어버리므로 매 테스트마다 새로 만든다.
let service: MenuDraftService;

beforeEach(() => {
  vi.clearAllMocks();

  config.get.mockReturnValue(HOURLY_LIMIT);
  service = new MenuDraftService(prisma, vision, redis, config);

  redis.incr.mockResolvedValue(1);
  redis.expire.mockResolvedValue(1);
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue("OK");

  prisma.category.findMany.mockResolvedValue([
    { publicId: "cat-1", name: "찌개류" },
  ]);
  prisma.menu.findMany.mockResolvedValue([]);

  vision.extract.mockResolvedValue(EXTRACTION);
});

describe("MenuDraftService — 인식 흐름", () => {
  it("인식 결과를 초안으로 돌려주고 DB에는 쓰지 않는다", async () => {
    const draft = await service.draftFromImages(OWNER, STORE_ID, [
      await menuPhoto(),
    ]);

    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      name: "김치찌개",
      price: 9000,
      category: { kind: "existing", categoryId: "cat-1" },
    });
    expect(prisma.menu.create).not.toHaveBeenCalled();
    expect(prisma.menu.createMany).not.toHaveBeenCalled();
  });

  it("매장의 기존 카테고리 이름을 프롬프트 힌트로 넘긴다", async () => {
    await service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()]);

    expect(vision.extract).toHaveBeenCalledWith(expect.anything(), ["찌개류"]);
  });

  it("중복 판정 대상에서 소프트 삭제된 메뉴를 제외한다", async () => {
    await service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()]);

    expect(prisma.menu.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
  });
});

describe("MenuDraftService — 캐시", () => {
  it("같은 사진 재요청이면 모델을 다시 부르지 않는다", async () => {
    redis.get.mockResolvedValue(JSON.stringify(EXTRACTION));

    const draft = await service.draftFromImages(OWNER, STORE_ID, [
      await menuPhoto(),
    ]);

    expect(vision.extract).not.toHaveBeenCalled();
    expect(draft.items).toHaveLength(1);
  });

  it("계약이 바뀌어 모양이 안 맞는 캐시는 버리고 다시 호출한다", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ items: "not-an-array" }));

    await service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()]);

    expect(vision.extract).toHaveBeenCalledTimes(1);
  });

  it("캐시 쓰기가 실패해도 응답은 정상이다", async () => {
    redis.set.mockRejectedValue(new Error("redis down"));

    const draft = await service.draftFromImages(OWNER, STORE_ID, [
      await menuPhoto(),
    ]);

    expect(draft.items).toHaveLength(1);
  });
});

describe("MenuDraftService — 레이트리밋", () => {
  it("상한을 넘으면 429로 거절하고 모델을 부르지 않는다", async () => {
    redis.incr.mockResolvedValue(HOURLY_LIMIT + 1);

    await expect(
      service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()])
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("상한과 같은 횟수까지는 통과한다", async () => {
    redis.incr.mockResolvedValue(HOURLY_LIMIT);

    await expect(
      service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()])
    ).resolves.toBeDefined();
  });

  it("첫 요청에만 TTL을 건다 — 매 요청마다 걸면 창이 영원히 갱신된다", async () => {
    redis.incr.mockResolvedValue(1);
    await service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()]);
    expect(redis.expire).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    config.get.mockReturnValue(HOURLY_LIMIT);
    redis.expire.mockResolvedValue(1);
    redis.incr.mockResolvedValue(2);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    prisma.category.findMany.mockResolvedValue([]);
    prisma.menu.findMany.mockResolvedValue([]);
    vision.extract.mockResolvedValue(EXTRACTION);

    await service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()]);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("Redis가 죽으면 열어두지 않고 503으로 닫는다", async () => {
    // fail-open으로 두면 Redis 장애가 그대로 무제한 유료 호출이 된다.
    redis.incr.mockRejectedValue(new Error("redis down"));

    await expect(
      service.draftFromImages(OWNER, STORE_ID, [await menuPhoto()])
    ).rejects.toBeInstanceOf(HttpException);

    expect(vision.extract).not.toHaveBeenCalled();
  });
});
