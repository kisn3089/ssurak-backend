import { StoreOpenReason } from "@ssurak/schema";
import {
  BusinessDayConfig,
  businessDateMinuteToDate,
  dayOfWeekOf,
  getBusinessDate,
  minutesFromBusinessDayStart,
  shiftBusinessDate,
} from "./business-day";

/** 다음 영업 시작 시각을 몇 일 앞까지 찾을지. 장기 휴업이면 null로 답한다. */
export const NEXT_OPEN_SEARCH_DAYS = 14;

/** 판정에 필요한 요일 행. Prisma 엔티티의 부분집합이다. */
export type BusinessHourRow = {
  dayOfWeek: number;
  isClosed: boolean;
  openMinute: number;
  closeMinute: number;
  breakStartMinute: number | null;
  breakEndMinute: number | null;
};

/** 판정에 필요한 휴무일 행. */
export type ClosureRow = {
  date: string;
  openMinute: number | null;
  closeMinute: number | null;
};

/**
 * 영업 상태 판정 결과.
 * 응답 계약(`@ssurak/schema`의 `StoreOpenState`)은 시각을 ISO 문자열로 두지만,
 * 여기서는 Date로 다룬다 — 직렬화는 응답 스키마 parse가 담당한다.
 */
export type StoreOpenState = {
  isOpen: boolean;
  reason: StoreOpenReason;
  businessDate: string;
  nextOpenAt: Date | null;
  closesAt: Date | null;
};

export type ResolveStoreOpenStateInput = {
  store: BusinessDayConfig & { isPaused: boolean };
  businessHours: BusinessHourRow[];
  closures: ClosureRow[];
  now: Date;
};

/** 하루치 영업 구간. 분은 모두 영업일 자정 기준이다. */
type DayWindow = {
  openMinute: number;
  closeMinute: number;
  breakStartMinute: number | null;
  breakEndMinute: number | null;
};

type DayPlan =
  | { kind: "always" }
  | {
      kind: "closed";
      reason:
        typeof StoreOpenReason.HOLIDAY | typeof StoreOpenReason.CLOSED_DAY;
    }
  | { kind: "window"; window: DayWindow };

/**
 * 해당 영업일의 계획을 정한다. 우선순위는 휴무일 → 정기 영업시간이며,
 * 영업시간을 한 번도 설정하지 않은 매장은 "항상 영업"으로 본다 —
 */
function dayPlanFor(
  businessDate: string,
  businessHours: BusinessHourRow[],
  closures: ClosureRow[]
): DayPlan {
  const closure = closures.find((candidate) => candidate.date === businessDate);

  if (closure) {
    const { openMinute, closeMinute } = closure;
    if (openMinute === null || closeMinute === null) {
      return { kind: "closed", reason: StoreOpenReason.HOLIDAY };
    }

    // 특별 영업시간에는 브레이크타임을 두지 않는다.
    return {
      kind: "window",
      window: {
        openMinute,
        closeMinute,
        breakStartMinute: null,
        breakEndMinute: null,
      },
    };
  }

  if (businessHours.length === 0) return { kind: "always" };

  const row = businessHours.find(
    (candidate) => candidate.dayOfWeek === dayOfWeekOf(businessDate)
  );

  // 영업시간은 PUT 전체 교체라 빠진 요일은 점주가 뺀 것이다 — 휴무로 본다.
  if (!row || row.isClosed) {
    return { kind: "closed", reason: StoreOpenReason.CLOSED_DAY };
  }

  return { kind: "window", window: row };
}

function isInBreak(window: DayWindow, minute: number): boolean {
  const { breakStartMinute, breakEndMinute } = window;
  if (breakStartMinute === null || breakEndMinute === null) return false;

  return minute >= breakStartMinute && minute < breakEndMinute;
}

function findNextOpenAt(
  input: ResolveStoreOpenStateInput,
  businessDate: string
): Date | null {
  const { store, businessHours, closures, now } = input;

  for (let offset = 0; offset <= NEXT_OPEN_SEARCH_DAYS; offset++) {
    const date = shiftBusinessDate(businessDate, offset);
    const plan = dayPlanFor(date, businessHours, closures);

    if (plan.kind === "closed") continue;

    if (plan.kind === "always") {
      const at = businessDateMinuteToDate(
        date,
        store.businessDayCutoff,
        store.timezone
      );
      if (at.getTime() > now.getTime()) return at;
      continue;
    }

    const { openMinute, breakEndMinute } = plan.window;
    const candidates =
      breakEndMinute === null ? [openMinute] : [openMinute, breakEndMinute];

    for (const minute of candidates) {
      const at = businessDateMinuteToDate(date, minute, store.timezone);
      if (at.getTime() > now.getTime()) return at;
    }
  }

  return null;
}

/**
 * 지금 이 매장이 주문을 받을 수 있는지 판정한다.
 * 우선순위: 수동 차단 → 임시 휴무일 → 정기 휴무 요일 → 영업 구간 → 브레이크타임.
 */
export function resolveStoreOpenState(
  input: ResolveStoreOpenStateInput
): StoreOpenState {
  const { store, businessHours, closures, now } = input;
  const businessDate = getBusinessDate(now, store);

  const closed = (
    reason: StoreOpenReason,
    nextOpenAt: Date | null
  ): StoreOpenState => ({
    isOpen: false,
    reason,
    businessDate,
    nextOpenAt,
    closesAt: null,
  });

  // 수동 중지는 스케줄로 풀리지 않는다 — 점주가 직접 해제해야 하므로 nextOpenAt은 없다.
  if (store.isPaused) {
    return closed(StoreOpenReason.MANUALLY_CLOSED, null);
  }

  const plan = dayPlanFor(businessDate, businessHours, closures);

  if (plan.kind === "always") {
    return {
      isOpen: true,
      reason: StoreOpenReason.OPEN,
      businessDate,
      nextOpenAt: null,
      closesAt: null,
    };
  }

  if (plan.kind === "closed") {
    return closed(plan.reason, findNextOpenAt(input, businessDate));
  }

  const { window } = plan;
  const minute = minutesFromBusinessDayStart(now, store);

  if (minute < window.openMinute) {
    return closed(
      StoreOpenReason.BEFORE_OPEN,
      findNextOpenAt(input, businessDate)
    );
  }

  if (minute >= window.closeMinute) {
    return closed(
      StoreOpenReason.AFTER_CLOSE,
      findNextOpenAt(input, businessDate)
    );
  }

  if (isInBreak(window, minute)) {
    return closed(
      StoreOpenReason.BREAK_TIME,
      findNextOpenAt(input, businessDate)
    );
  }

  return {
    isOpen: true,
    reason: StoreOpenReason.OPEN,
    businessDate,
    nextOpenAt: null,
    closesAt: businessDateMinuteToDate(
      businessDate,
      window.closeMinute,
      store.timezone
    ),
  };
}
