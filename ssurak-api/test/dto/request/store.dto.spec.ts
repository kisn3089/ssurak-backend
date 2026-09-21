import { describe, expect, it } from "vitest";
import { updateStorePayloadSchema } from "@ssurak/schema";
import { isSupportedTimezone } from "src/common/business-hours";

const parseTimezone = (timezone: string) =>
  updateStorePayloadSchema.safeParse({ timezone });

describe("updateStorePayloadSchema — timezone", () => {
  // 스키마는 형식만 보고 실재 여부는 서비스가 Intl로 본다. 스키마가 더 좁으면
  // 서비스가 지원하는 이름이 400으로 막히므로 두 판정이 어긋나면 안 된다.
  it("지역 구분이 없는 이름도 받는다", () => {
    for (const timezone of ["UTC", "GMT"]) {
      expect(parseTimezone(timezone).success).toBe(true);
      expect(isSupportedTimezone(timezone)).toBe(true);
    }
  });

  it("지역/도시 이름과 Etc 계열을 받는다", () => {
    for (const timezone of ["Asia/Seoul", "America/New_York", "Etc/GMT+9"]) {
      expect(parseTimezone(timezone).success).toBe(true);
      expect(isSupportedTimezone(timezone)).toBe(true);
    }
  });

  it("형식이 아닌 문자열은 거절한다", () => {
    for (const timezone of ["Asia/", "/Seoul", "Asia Seoul", "Asia//Seoul"]) {
      expect(parseTimezone(timezone).success).toBe(false);
    }
  });
});
