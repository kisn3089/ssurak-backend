/**
 * 하루의 분 수. 영업시간은 자정 기준 분으로 저장되며,
 * 자정을 넘기는 영업은 closeMinute이 이 값을 넘는다(예: 26:00 → 1560).
 */
export const MINUTES_PER_DAY = 1440;

/** 요일. 0=일 ~ 6=토로 JS `Date#getDay()`와 같은 값이다. */
export const DAY_OF_WEEK_MIN = 0;
export const DAY_OF_WEEK_MAX = 6;

/** 요일별 정기 영업시간 응답. */
export interface StoreBusinessHour {
  /** 0=일 ~ 6=토 */
  dayOfWeek: number;
  /** 정기 휴무 요일. true면 open/close 값은 의미가 없다. */
  isClosed: boolean;
  /** 자정 기준 분 */
  openMinute: number;
  /** 자정 기준 분. 자정을 넘기는 영업이면 1440을 넘는다. */
  closeMinute: number;
  /** 브레이크타임 시작. 없으면 null */
  breakStartMinute: number | null;
  /** 브레이크타임 종료. 없으면 null */
  breakEndMinute: number | null;
}

/** 특정 날짜의 임시 휴무 또는 특별 영업시간 응답. */
export interface StoreClosure {
  publicId: string;
  /** "YYYY-MM-DD" */
  date: string;
  reason: string | null;
  /** null이면 종일 휴무 */
  openMinute: number | null;
  /** null이면 종일 휴무 */
  closeMinute: number | null;
}

/**
 * 매장이 지금 주문을 받을 수 있는지에 대한 판정 결과.
 * 판정 우선순위: MANUALLY_CLOSED → HOLIDAY → CLOSED_DAY → 영업 구간 → BREAK_TIME.
 */
export const StoreOpenReason = {
  /** 주문을 받을 수 있다 */
  OPEN: "OPEN",
  /** 점주가 수동으로 주문을 막았다 (Store.isPaused === true) */
  MANUALLY_CLOSED: "MANUALLY_CLOSED",
  /** 해당 날짜가 임시 휴무일이다 */
  HOLIDAY: "HOLIDAY",
  /** 해당 요일이 정기 휴무일이다 */
  CLOSED_DAY: "CLOSED_DAY",
  /** 오늘 영업은 아직 시작하지 않았다 */
  BEFORE_OPEN: "BEFORE_OPEN",
  /** 오늘 영업이 이미 끝났다 */
  AFTER_CLOSE: "AFTER_CLOSE",
  /** 브레이크타임이다 */
  BREAK_TIME: "BREAK_TIME",
} as const;

export type StoreOpenReason =
  (typeof StoreOpenReason)[keyof typeof StoreOpenReason];

export interface StoreOpenState {
  isOpen: boolean;
  reason: StoreOpenReason;
  /** 판정 시점이 속한 영업일 "YYYY-MM-DD" */
  businessDate: string;
  /** 다음 영업 시작 시각(ISO). 탐색 범위 안에 없으면 null */
  nextOpenAt: string | null;
  /** 영업 중일 때의 마감 시각(ISO). 영업 중이 아니면 null */
  closesAt: string | null;
}
