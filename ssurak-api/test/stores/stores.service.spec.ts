import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { HttpException } from "@nestjs/common";
import { Owner, Store } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import { StoresService } from "src/stores/stores/stores.service";

const STORE_ID = "store-public-id";

/** 2026-09-21T03:00Z = KST 12:00. cutoff 720 기준으로 영업일이 막 시작된 시점이다. */
const NOW = new Date("2026-09-21T03:00:00Z");

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

const storeRow: Store = {
  id: 1n,
  publicId: STORE_ID,
  ownerId: owner.id,
  name: "싸락 1호점",
  phone: null,
  address: "서울시 어딘가",
  addressDetail: null,
  description: null,
  isPaused: false,
  acceptedMessage: null,
  timezone: "Asia/Seoul",
  businessDayCutoff: 300,
  orderNumberPrefix: "A",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const prisma = mockDeep<PrismaService>();
const service = new StoresService(prisma);

/** 06:00~12:00 특별 영업. cutoff를 720(12:00)으로 올리면 이 창은 영업일 밖으로 밀린다. */
const closureRow = {
  id: 3n,
  publicId: "closure-public-id",
  storeId: storeRow.id,
  date: "2026-10-01",
  reason: "단축 영업",
  openMinute: 360,
  closeMinute: 720,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const updateCutoff = (cutoff: number, timezone?: string) =>
  service.partialUpdateStore(owner, STORE_ID, {
    businessDayCutoff: cutoff,
    ...(timezone ? { timezone } : {}),
  });

const catchError = async (promise: Promise<unknown>): Promise<unknown> =>
  await promise.then(
    () => null,
    (error: unknown) => error
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);

  prisma.store.findFirstOrThrow.mockResolvedValue(storeRow);
  prisma.store.update.mockResolvedValue(storeRow);
  prisma.storeBusinessHour.findFirst.mockResolvedValue(null);
  prisma.storeClosure.findFirst.mockResolvedValue(null);

  prisma.store.update.mockClear();
  prisma.storeClosure.findFirst.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StoresService.partialUpdateStore — businessDayCutoff 가드", () => {
  it("경계 밖으로 밀리는 특별 영업시간이 있으면 거절한다", async () => {
    prisma.storeClosure.findFirst.mockResolvedValue(closureRow);

    const error = await catchError(updateCutoff(720));

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: "BUSINESS_HOURS_OUT_OF_RANGE",
      details: {
        cutoff: 720,
        conflicting: expect.objectContaining({ date: "2026-10-01" }),
      },
    });
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it("종일 휴무(시간 미지정)는 경계와 무관하므로 조회에서 뺀다", async () => {
    await updateCutoff(720);

    expect(prisma.storeClosure.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          openMinute: { not: null },
          closeMinute: { not: null },
        }),
      })
    );
  });

  it("지난 휴무일은 판정에 쓰이지 않으므로 오늘 영업일부터 본다", async () => {
    await updateCutoff(720);

    expect(prisma.storeClosure.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: "2026-09-21" } }),
      })
    );
  });

  it("같은 요청에서 타임존도 바꾸면 바뀐 타임존 기준으로 오늘을 센다", async () => {
    // UTC 03:00은 cutoff 720 이전이라 영업일이 전날로 접힌다.
    await updateCutoff(720, "UTC");

    expect(prisma.storeClosure.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ date: { gte: "2026-09-20" } }),
      })
    );
  });

  it("경계 밖 영업시간이 없으면 변경을 진행한다", async () => {
    await updateCutoff(720);

    expect(prisma.store.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessDayCutoff: 720 }),
      })
    );
  });
});
