import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { Owner, Store } from "@ssurak/db";
import { StoreOpenStateService } from "src/common/business-hours";
import { PrismaService } from "src/prisma/prisma.service";
import { BusinessHoursService } from "src/stores/business-hours/business-hours.service";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";

const STORE_ID = "store-public-id";

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

/** 소유권 확인이 돌려주는 매장. cutoff 300 = 05:00 경계. */
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
const openState = mockDeep<StoreOpenStateService>();
const service = new BusinessHoursService(prisma, openState);

const day = (overrides: Record<string, unknown> = {}) => ({
  dayOfWeek: 3,
  isClosed: false,
  openMinute: 540,
  closeMinute: 1320,
  breakStartMinute: null,
  breakEndMinute: null,
  ...overrides,
});

const outOfRange = (fn: () => Promise<unknown>) =>
  expectHttpExceptionAsync(fn, {
    code: "BUSINESS_HOURS_OUT_OF_RANGE",
    status: 400,
  });

beforeEach(() => {
  prisma.store.findFirstOrThrow.mockResolvedValue(storeRow);
});

describe("BusinessHoursService — 영업일 경계 위반 details", () => {
  it("요일 영업시간은 요일 번호와 위반한 시각을 그대로 담는다", async () => {
    // 02:00 오픈은 cutoff 05:00보다 앞서 영업일 밖이다.
    const response = await outOfRange(() =>
      service.replaceBusinessHours(owner, STORE_ID, {
        days: [day({ openMinute: 120 })],
      })
    );

    expect(response.details).toMatchObject({
      cutoff: 300,
      dayOfWeek: 3,
      openMinute: 120,
    });
  });

  it("특별 영업시간은 요일이 없으므로 시각만 담는다", async () => {
    const response = await outOfRange(() =>
      service.createClosure(owner, STORE_ID, {
        date: "2026-10-01",
        openMinute: 120,
        closeMinute: 600,
      })
    );

    expect(response.details).toMatchObject({ cutoff: 300, openMinute: 120 });
    expect(response.details).not.toHaveProperty("dayOfWeek");
  });
});
