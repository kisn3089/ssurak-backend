/**
 * 영업시간·휴무일 시드.
 * 자정 넘김(금·토 심야 영업)과 브레이크타임을 함께 넣어,
 * 시드만으로도 영업 판정의 까다로운 경로가 데이터로 존재하게 한다.
 */

export type BusinessHourSeed = {
  /** 0=일 ~ 6=토 */
  dayOfWeek: number;
  isClosed: boolean;
  openMinute: number;
  closeMinute: number;
  breakStartMinute?: number;
  breakEndMinute?: number;
};

const hours = (hour: number, minute = 0) => hour * 60 + minute;

/**
 * 데모 매장: 월요일 정기 휴무, 평일 09:00~22:00(15:00~16:00 브레이크),
 * 금·토는 18:00~다음날 02:00 심야 영업, 일요일 10:00~20:00.
 */
export const demoBusinessHourSeeds: BusinessHourSeed[] = [
  {
    dayOfWeek: 0,
    isClosed: false,
    openMinute: hours(10),
    closeMinute: hours(20),
  },
  // 월요일 정기 휴무. 행을 지우지 않고 플래그만 세워 이전 시간을 남겨둔다.
  {
    dayOfWeek: 1,
    isClosed: true,
    openMinute: hours(9),
    closeMinute: hours(22),
  },
  {
    dayOfWeek: 2,
    isClosed: false,
    openMinute: hours(9),
    closeMinute: hours(22),
    breakStartMinute: hours(15),
    breakEndMinute: hours(16),
  },
  {
    dayOfWeek: 3,
    isClosed: false,
    openMinute: hours(9),
    closeMinute: hours(22),
    breakStartMinute: hours(15),
    breakEndMinute: hours(16),
  },
  {
    dayOfWeek: 4,
    isClosed: false,
    openMinute: hours(9),
    closeMinute: hours(22),
    breakStartMinute: hours(15),
    breakEndMinute: hours(16),
  },
  // 금·토 심야 영업. 마감 26:00 = 다음날 02:00 (cutoff 300 이하이므로 유효)
  {
    dayOfWeek: 5,
    isClosed: false,
    openMinute: hours(18),
    closeMinute: hours(26),
  },
  {
    dayOfWeek: 6,
    isClosed: false,
    openMinute: hours(18),
    closeMinute: hours(26),
  },
];

/**
 * 테스트 매장은 e2e·수동 확인에서 언제든 주문이 들어가야 하므로
 * 영업시간을 설정하지 않는다 — 행이 없으면 항상 영업으로 판정된다.
 */
export const testBusinessHourSeeds: BusinessHourSeed[] = [];

export type ClosureSeed = {
  /** "MM-DD". 시드 실행 연도를 붙여 쓴다. */
  monthDay: string;
  reason: string;
  openMinute?: number;
  closeMinute?: number;
};

/** 데모 매장의 임시 휴무·특별 영업. 정기 영업시간보다 우선한다. */
export const demoClosureSeeds: ClosureSeed[] = [
  { monthDay: "12-25", reason: "성탄절 휴무" },
  {
    monthDay: "12-31",
    reason: "연말 단축 영업",
    openMinute: hours(11),
    closeMinute: hours(18),
  },
];
