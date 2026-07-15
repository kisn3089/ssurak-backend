import { describe, expect, it } from "vitest";
import { publicTableSessionSchema } from "@ssurak/schema";

const sessionRowFixture = () => ({
  id: 50n,
  tableId: 2n,
  publicId: "session-public-id",
  status: "ACTIVE",
  sessionToken: "session-token",
  activatedAt: new Date("2026-01-01T00:00:00.000Z"),
  expiresAt: new Date("2026-01-01T02:00:00.000Z"),
  closedAt: null,
  paidAmount: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

describe("publicTableSessionSchema", () => {
  it("내부 식별자(id, tableId)를 응답에서 제거한다", () => {
    const parsed = publicTableSessionSchema.parse(sessionRowFixture());

    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("tableId");
    expect(parsed.sessionToken).toBe("session-token");
  });

  it("제거된 PAYMENT_PENDING 상태는 더 이상 유효하지 않다", () => {
    expect(() =>
      publicTableSessionSchema.parse({
        ...sessionRowFixture(),
        status: "PAYMENT_PENDING",
      })
    ).toThrow();
  });

  it("날짜 필드를 ISO 문자열로 직렬화한다", () => {
    const parsed = publicTableSessionSchema.parse(sessionRowFixture());
    expect(parsed.expiresAt).toBe("2026-01-01T02:00:00.000Z");
    expect(parsed.closedAt).toBeNull();
  });
});
