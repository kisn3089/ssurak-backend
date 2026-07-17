import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TableSession } from "@ssurak/db";
import {
  isActivateTableOrThrow,
  isSessionExpired,
} from "src/common/validate/session/alive-session";
import { expectHttpException } from "test/helpers/expect-http-exception";

const sessionFixture = (expiresAt: Date): Pick<TableSession, "expiresAt"> => ({
  expiresAt,
});

describe("isActivateTableOrThrow", () => {
  it("활성 테이블은 통과한다", () => {
    expect(() => isActivateTableOrThrow(true)).not.toThrow();
  });

  it("비활성 테이블이면 TABLE_INACTIVE(403)", () => {
    expectHttpException(() => isActivateTableOrThrow(false), {
      code: "TABLE_INACTIVE",
      status: HttpStatus.FORBIDDEN,
    });
  });
});

describe("isSessionExpired", () => {
  it("만료 시각이 지난 세션은 true", () => {
    expect(isSessionExpired(sessionFixture(new Date(Date.now() - 1000)))).toBe(
      true
    );
  });

  it("만료 시각이 남은 세션은 false", () => {
    expect(
      isSessionExpired(sessionFixture(new Date(Date.now() + 60_000)))
    ).toBe(false);
  });
});
