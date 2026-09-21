import { StoreOpenReason } from "@ssurak/schema";
import { describe, expect, it } from "vitest";
import {
  BusinessHourRow,
  ClosureRow,
  resolveStoreOpenState,
} from "src/common/business-hours";

const SEOUL = {
  timezone: "Asia/Seoul",
  businessDayCutoff: 300,
  isPaused: false,
};

const kst = (iso: string): Date => new Date(`${iso}+09:00`);

const hours = (hour: number) => hour * 60;

const day = (
  dayOfWeek: number,
  overrides: Partial<BusinessHourRow> = {}
): BusinessHourRow => ({
  dayOfWeek,
  isClosed: false,
  openMinute: hours(9),
  closeMinute: hours(22),
  breakStartMinute: null,
  breakEndMinute: null,
  ...overrides,
});

/** 2026-08-26은 수요일(3), 08-28은 금요일(5) */
const everyDay = (overrides: Partial<BusinessHourRow> = {}) =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => day(dayOfWeek, overrides));

const resolve = (input: {
  now: Date;
  businessHours?: BusinessHourRow[];
  closures?: ClosureRow[];
  isPaused?: boolean;
}) =>
  resolveStoreOpenState({
    store: { ...SEOUL, isPaused: input.isPaused ?? false },
    businessHours: input.businessHours ?? [],
    closures: input.closures ?? [],
    now: input.now,
  });

describe("resolveStoreOpenState", () => {
  it("영업시간을 한 번도 설정하지 않은 매장은 항상 영업이다", () => {
    const state = resolve({ now: kst("2026-08-26T04:00") });

    expect(state.isOpen).toBe(true);
    expect(state.reason).toBe(StoreOpenReason.OPEN);
  });

  it("수동 중지가 다른 모든 조건보다 앞선다", () => {
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      businessHours: everyDay(),
      isPaused: true,
    });

    expect(state.isOpen).toBe(false);
    expect(state.reason).toBe(StoreOpenReason.MANUALLY_CLOSED);
    // 스케줄로 풀리지 않으므로 다음 영업 시각을 약속하지 않는다.
    expect(state.nextOpenAt).toBeNull();
  });

  it("영업 구간 안이면 영업 중이고 마감 시각을 함께 준다", () => {
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      businessHours: everyDay(),
    });

    expect(state.isOpen).toBe(true);
    expect(state.businessDate).toBe("2026-08-26");
    expect(state.closesAt?.toISOString()).toBe(
      kst("2026-08-26T22:00").toISOString()
    );
  });

  it("오픈 전에는 BEFORE_OPEN과 오늘 오픈 시각을 준다", () => {
    const state = resolve({
      now: kst("2026-08-26T08:00"),
      businessHours: everyDay(),
    });

    expect(state.reason).toBe(StoreOpenReason.BEFORE_OPEN);
    expect(state.nextOpenAt?.toISOString()).toBe(
      kst("2026-08-26T09:00").toISOString()
    );
  });

  it("마감 후에는 AFTER_CLOSE와 다음 날 오픈 시각을 준다", () => {
    const state = resolve({
      now: kst("2026-08-26T23:00"),
      businessHours: everyDay(),
    });

    expect(state.reason).toBe(StoreOpenReason.AFTER_CLOSE);
    expect(state.nextOpenAt?.toISOString()).toBe(
      kst("2026-08-27T09:00").toISOString()
    );
  });

  it("정기 휴무 요일은 CLOSED_DAY로 거절하고 다음 영업일을 건너뛴다", () => {
    // 수요일(3)만 휴무
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      businessHours: everyDay().map((row) =>
        row.dayOfWeek === 3 ? { ...row, isClosed: true } : row
      ),
    });

    expect(state.reason).toBe(StoreOpenReason.CLOSED_DAY);
    expect(state.nextOpenAt?.toISOString()).toBe(
      kst("2026-08-27T09:00").toISOString()
    );
  });

  it("요일 행이 빠져 있으면 그 요일은 휴무다", () => {
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      businessHours: everyDay().filter((row) => row.dayOfWeek !== 3),
    });

    expect(state.reason).toBe(StoreOpenReason.CLOSED_DAY);
  });

  it("브레이크타임에는 BREAK_TIME으로 거절하고 종료 시각을 다음 오픈으로 준다", () => {
    const state = resolve({
      now: kst("2026-08-26T15:30"),
      businessHours: everyDay({
        breakStartMinute: hours(15),
        breakEndMinute: hours(16),
      }),
    });

    expect(state.reason).toBe(StoreOpenReason.BREAK_TIME);
    expect(state.nextOpenAt?.toISOString()).toBe(
      kst("2026-08-26T16:00").toISOString()
    );
  });

  it("브레이크타임 종료 정각에는 다시 영업이다", () => {
    const state = resolve({
      now: kst("2026-08-26T16:00"),
      businessHours: everyDay({
        breakStartMinute: hours(15),
        breakEndMinute: hours(16),
      }),
    });

    expect(state.isOpen).toBe(true);
  });

  it("임시 휴무일이 정기 영업시간을 이긴다", () => {
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      businessHours: everyDay(),
      closures: [{ date: "2026-08-26", openMinute: null, closeMinute: null }],
    });

    expect(state.reason).toBe(StoreOpenReason.HOLIDAY);
    expect(state.nextOpenAt?.toISOString()).toBe(
      kst("2026-08-27T09:00").toISOString()
    );
  });

  it("특별 영업시간이 있는 날은 그 시간만 영업한다", () => {
    const closures: ClosureRow[] = [
      { date: "2026-08-26", openMinute: hours(11), closeMinute: hours(18) },
    ];

    expect(
      resolve({
        now: kst("2026-08-26T10:00"),
        businessHours: everyDay(),
        closures,
      }).reason
    ).toBe(StoreOpenReason.BEFORE_OPEN);
    expect(
      resolve({
        now: kst("2026-08-26T12:00"),
        businessHours: everyDay(),
        closures,
      }).isOpen
    ).toBe(true);
    expect(
      resolve({
        now: kst("2026-08-26T19:00"),
        businessHours: everyDay(),
        closures,
      }).reason
    ).toBe(StoreOpenReason.AFTER_CLOSE);
  });

  it("영업시간 미설정이어도 등록된 휴무일에는 쉰다", () => {
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      closures: [{ date: "2026-08-26", openMinute: null, closeMinute: null }],
    });

    expect(state.reason).toBe(StoreOpenReason.HOLIDAY);
    // 수동 중지가 아니므로 재개 시각이 있어야 한다 — 다음 영업일 시작(cutoff 05:00).
    expect(state.nextOpenAt?.toISOString()).toBe(
      kst("2026-08-27T05:00").toISOString()
    );
  });

  it("영업시간 미설정 매장의 연속 휴무는 마지막 휴무 다음 영업일에 열린다", () => {
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      closures: [
        { date: "2026-08-26", openMinute: null, closeMinute: null },
        { date: "2026-08-27", openMinute: null, closeMinute: null },
      ],
    });

    expect(state.nextOpenAt?.toISOString()).toBe(
      kst("2026-08-28T05:00").toISOString()
    );
  });

  describe("자정을 넘기는 심야 영업 (18:00~26:00)", () => {
    const lateNight = everyDay({
      openMinute: hours(18),
      closeMinute: hours(26),
    });

    it("자정을 넘긴 01:30도 전날 영업일의 영업 중이다", () => {
      const state = resolve({
        now: kst("2026-08-27T01:30"),
        businessHours: lateNight,
      });

      expect(state.isOpen).toBe(true);
      expect(state.businessDate).toBe("2026-08-26");
      expect(state.closesAt?.toISOString()).toBe(
        kst("2026-08-27T02:00").toISOString()
      );
    });

    it("마감 02:00 이후에는 같은 날 18:00 오픈을 기다린다", () => {
      const state = resolve({
        now: kst("2026-08-27T03:00"),
        businessHours: lateNight,
      });

      expect(state.reason).toBe(StoreOpenReason.AFTER_CLOSE);
      expect(state.businessDate).toBe("2026-08-26");
      expect(state.nextOpenAt?.toISOString()).toBe(
        kst("2026-08-27T18:00").toISOString()
      );
    });
  });

  it("탐색 범위 안에 영업일이 없으면 nextOpenAt은 null이다", () => {
    const state = resolve({
      now: kst("2026-08-26T12:00"),
      businessHours: everyDay({ isClosed: true }),
    });

    expect(state.reason).toBe(StoreOpenReason.CLOSED_DAY);
    expect(state.nextOpenAt).toBeNull();
  });
});
