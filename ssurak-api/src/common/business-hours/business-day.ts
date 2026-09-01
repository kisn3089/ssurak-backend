import { MINUTES_PER_DAY } from "@ssurak/schema";

/**
 * 영업일 계산에 필요한 매장 설정.
 * Store 엔티티 전체가 아니라 이 두 값만 받아 순수 함수로 유지한다.
 */
export type BusinessDayConfig = {
  /** IANA 타임존 (예: "Asia/Seoul") */
  timezone: string;
  /** 영업일 경계(자정 기준 분). 이 시각 이전은 전날 영업일이다. */
  businessDayCutoff: number;
};

/** 매장 타임존 벽시계의 연·월·일·시·분. */
export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/**
 * Intl.DateTimeFormat 생성은 비싸다. 타임존 수가 매장 수보다 훨씬 적으므로
 * 프로세스 수명 동안 캐싱해도 메모리가 늘지 않는다.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    // h23이어야 자정이 "00"으로 나온다. hour12: false는 런타임에 따라 "24"를 낸다.
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  formatterCache.set(timezone, formatter);
  return formatter;
}

/** IANA 타임존 이름으로 실제 포매터를 만들 수 있는지. 매장 설정 검증에 쓴다. */
export function isSupportedTimezone(timezone: string): boolean {
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
}

/** UTC 시각을 매장 타임존의 벽시계 값으로 바꾼다. */
export function zonedParts(now: Date, timezone: string): ZonedParts {
  const parts = formatterFor(timezone).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) {
      throw new Error(`타임존 ${timezone}에서 ${type}을(를) 읽지 못했습니다.`);
    }
    return Number(part.value);
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

const pad = (value: number, length: number): string =>
  String(value).padStart(length, "0");

/** 연·월·일을 영업일 키 "YYYY-MM-DD"로 만든다. */
export function toDateKey(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

/**
 * 영업일 키에 일수를 더한다.
 * Date.UTC 기반 순수 달력 연산이라 DST·타임존과 무관하게 정확하다.
 */
export function shiftBusinessDate(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return toDateKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate()
  );
}

/** 영업일 키의 요일. 0=일 ~ 6=토으로 JS Date#getDay()와 같다. */
export function dayOfWeekOf(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * 매장 타임존 시간이 cutoff 이전이면 전날 영업일로 접는다 —
 * 새벽 2시 주문이 전날 장사에 묶이게 하는 것이 이 함수의 목적이다.
 * @return 영업일 키 "YYYY-MM-DD"
 */
export function getBusinessDate(now: Date, config: BusinessDayConfig): string {
  const { year, month, day, hour, minute } = zonedParts(now, config.timezone);
  const calendarDate = toDateKey(year, month, day);

  return hour * 60 + minute >= config.businessDayCutoff
    ? calendarDate
    : shiftBusinessDate(calendarDate, -1);
}

/**
 * 영업일 자정을 0으로 본 경과 분. 값 범위는 [cutoff, cutoff + 1440).
 *
 * 이 정규화 덕분에 자정을 넘기는 영업(18:00~26:00)도
 * `openMinute <= n < closeMinute` 한 줄로 판정된다.
 */
export function minutesFromBusinessDayStart(
  now: Date,
  config: BusinessDayConfig
): number {
  const { hour, minute } = zonedParts(now, config.timezone);
  const minuteOfDay = hour * 60 + minute;

  return minuteOfDay >= config.businessDayCutoff
    ? minuteOfDay
    : minuteOfDay + MINUTES_PER_DAY;
}

/** 주어진 시각에서 매장 타임존이 UTC보다 앞선 밀리초. */
function zoneOffsetMs(at: Date, timezone: string): number {
  const parts = zonedParts(at, timezone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );
  // zonedParts는 분까지만 읽으므로 비교 대상도 분 단위로 절삭한다.
  const truncated = Math.floor(at.getTime() / 60_000) * 60_000;

  return asIfUtc - truncated;
}

/**
 * "영업일 + 영업일 기준 분" → 실제 UTC 시각.
 * 분이 1440을 넘으면 다음 날로 넘어간 시각으로 해석한다(마감 26:00 등).
 */
export function businessDateMinuteToDate(
  dateKey: string, // 영업일 키 "YYYY-MM-DD"
  minuteFromMidnight: number,
  timezone: string
): Date {
  const dayOffset = Math.floor(minuteFromMidnight / MINUTES_PER_DAY);
  const minuteInDay = minuteFromMidnight - dayOffset * MINUTES_PER_DAY;
  const { year, month, day } = parseDateKey(
    shiftBusinessDate(dateKey, dayOffset)
  );

  const wallClockAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minuteInDay / 60),
    minuteInDay % 60
  );

  // 벽시계를 UTC로 본 뒤 오프셋만큼 되돌린다. DST 경계에서는 되돌린 시각의
  // 오프셋이 달라질 수 있어 한 번 더 보정한다(KST는 해당 없지만 타임존이 열려 있다).
  const firstGuess = new Date(
    wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc), timezone)
  );
  const correctedOffset = zoneOffsetMs(firstGuess, timezone);

  return new Date(wallClockAsUtc - correctedOffset);
}
