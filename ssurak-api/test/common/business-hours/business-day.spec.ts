import { describe, expect, it } from "vitest";
import {
  businessDateMinuteToDate,
  dayOfWeekOf,
  getBusinessDate,
  isSupportedTimezone,
  minutesFromBusinessDayStart,
  shiftBusinessDate,
} from "src/common/business-hours";

/** 기본값과 같은 설정: 서울, 새벽 5시 경계 */
const SEOUL = { timezone: "Asia/Seoul", businessDayCutoff: 300 };

/** KST 벽시계를 UTC Date로. KST는 DST가 없어 고정 -9시간이면 정확하다. */
const kst = (iso: string): Date => new Date(`${iso}+09:00`);

describe("getBusinessDate", () => {
  it("cutoff 이후는 달력 날짜 그대로다", () => {
    expect(getBusinessDate(kst("2026-08-26T05:00"), SEOUL)).toBe("2026-08-26");
    expect(getBusinessDate(kst("2026-08-26T23:30"), SEOUL)).toBe("2026-08-26");
  });

  it("cutoff 이전은 전날 영업일로 접힌다", () => {
    expect(getBusinessDate(kst("2026-08-27T00:10"), SEOUL)).toBe("2026-08-26");
    expect(getBusinessDate(kst("2026-08-27T04:59"), SEOUL)).toBe("2026-08-26");
  });

  it("cutoff 정각에 다음 영업일로 넘어간다", () => {
    expect(getBusinessDate(kst("2026-08-27T04:59"), SEOUL)).toBe("2026-08-26");
    expect(getBusinessDate(kst("2026-08-27T05:00"), SEOUL)).toBe("2026-08-27");
  });

  it("월·연 경계를 넘어도 달력 계산이 맞다", () => {
    expect(getBusinessDate(kst("2026-09-01T02:00"), SEOUL)).toBe("2026-08-31");
    expect(getBusinessDate(kst("2027-01-01T03:00"), SEOUL)).toBe("2026-12-31");
  });

  it("cutoff 0이면 달력 날짜와 항상 같다", () => {
    const midnightCutoff = { timezone: "Asia/Seoul", businessDayCutoff: 0 };
    expect(getBusinessDate(kst("2026-08-27T00:10"), midnightCutoff)).toBe(
      "2026-08-27"
    );
  });

  it("타임존이 다르면 같은 순간이라도 영업일이 달라진다", () => {
    const at = kst("2026-08-27T09:00"); // UTC로는 2026-08-27T00:00
    expect(getBusinessDate(at, SEOUL)).toBe("2026-08-27");
    expect(
      getBusinessDate(at, { timezone: "UTC", businessDayCutoff: 300 })
    ).toBe("2026-08-26");
  });
});

describe("minutesFromBusinessDayStart", () => {
  it("cutoff 이후는 벽시계 분과 같다", () => {
    expect(minutesFromBusinessDayStart(kst("2026-08-26T18:00"), SEOUL)).toBe(
      18 * 60
    );
  });

  it("자정을 넘긴 시각은 1440을 더해 연속된 값이 된다", () => {
    // 01:30은 전날 영업일의 25.5시간째다.
    expect(minutesFromBusinessDayStart(kst("2026-08-27T01:30"), SEOUL)).toBe(
      25 * 60 + 30
    );
  });

  it("값은 항상 [cutoff, cutoff + 1440) 안에 있다", () => {
    for (let hour = 0; hour < 24; hour++) {
      const minute = minutesFromBusinessDayStart(
        kst(`2026-08-26T${String(hour).padStart(2, "0")}:00`),
        SEOUL
      );
      expect(minute).toBeGreaterThanOrEqual(SEOUL.businessDayCutoff);
      expect(minute).toBeLessThan(SEOUL.businessDayCutoff + 1440);
    }
  });
});

describe("shiftBusinessDate", () => {
  it("월·연 경계를 넘어간다", () => {
    expect(shiftBusinessDate("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftBusinessDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("윤년 2월을 정확히 센다", () => {
    expect(shiftBusinessDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftBusinessDate("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("dayOfWeekOf", () => {
  it("0=일 ~ 6=토로 답한다", () => {
    expect(dayOfWeekOf("2026-08-23")).toBe(0);
    expect(dayOfWeekOf("2026-08-26")).toBe(3);
    expect(dayOfWeekOf("2026-08-29")).toBe(6);
  });
});

describe("businessDateMinuteToDate", () => {
  it("영업일 기준 분을 실제 시각으로 되돌린다", () => {
    expect(
      businessDateMinuteToDate(
        "2026-08-26",
        18 * 60,
        "Asia/Seoul"
      ).toISOString()
    ).toBe(kst("2026-08-26T18:00").toISOString());
  });

  it("1440을 넘는 분은 다음 날 시각이 된다", () => {
    // 마감 26:00 = 다음날 02:00
    expect(
      businessDateMinuteToDate(
        "2026-08-26",
        26 * 60,
        "Asia/Seoul"
      ).toISOString()
    ).toBe(kst("2026-08-27T02:00").toISOString());
  });

  it("minutesFromBusinessDayStart와 왕복해도 값이 보존된다", () => {
    const at = kst("2026-08-27T01:30");
    const businessDate = getBusinessDate(at, SEOUL);
    const minute = minutesFromBusinessDayStart(at, SEOUL);

    expect(
      businessDateMinuteToDate(
        businessDate,
        minute,
        SEOUL.timezone
      ).toISOString()
    ).toBe(at.toISOString());
  });
});

describe("타임존 이름 변형", () => {
  // 포매터 캐시는 Intl 정규화 이름을 키로 쓴다. 변형 이름이 다른 존의
  // 포매터를 집어오면 영업일 판정이 통째로 어긋난다.
  it("대소문자가 달라도 같은 존으로 해석한다", () => {
    const at = kst("2026-08-27T01:00");

    for (const timezone of ["asia/seoul", "ASIA/SEOUL"]) {
      expect(getBusinessDate(at, { ...SEOUL, timezone })).toBe(
        getBusinessDate(at, SEOUL)
      );
      expect(minutesFromBusinessDayStart(at, { ...SEOUL, timezone })).toBe(
        minutesFromBusinessDayStart(at, SEOUL)
      );
    }
  });
});

describe("isSupportedTimezone", () => {
  it("IANA 타임존만 통과시킨다", () => {
    expect(isSupportedTimezone("Asia/Seoul")).toBe(true);
    expect(isSupportedTimezone("UTC")).toBe(true);
    expect(isSupportedTimezone("Not/AZone")).toBe(false);
  });
});
