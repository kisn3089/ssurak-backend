import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  MenuValidationFields,
  validateMenuMismatchOrThrow,
} from "src/common/validate/menu/mismatch";
import { expectHttpException } from "test/helpers/expect-http-exception";

const menuFixture = (publicId: string): MenuValidationFields => ({
  id: 1n,
  publicId,
  name: `메뉴-${publicId}`,
  price: 1000,
  imageKey: null,
  requiredOptions: null,
  customOptions: null,
  isAvailable: true,
});

describe("validateMenuMismatchOrThrow", () => {
  it("요청한 모든 메뉴가 조회되면 통과한다", () => {
    expect(() =>
      validateMenuMismatchOrThrow(
        [menuFixture("menu-a"), menuFixture("menu-b")],
        ["menu-a", "menu-b"]
      )
    ).not.toThrow();
  });

  it("요청 메뉴 목록이 비어 있으면 통과한다", () => {
    expect(() => validateMenuMismatchOrThrow([], [])).not.toThrow();
  });

  it("조회되지 않은 메뉴가 있으면 MENU_MISMATCH(400)와 누락 id 목록을 던진다", () => {
    expectHttpException(
      () =>
        validateMenuMismatchOrThrow(
          [menuFixture("menu-a")],
          ["menu-a", "menu-b", "menu-c"]
        ),
      {
        code: "MENU_MISMATCH",
        status: HttpStatus.BAD_REQUEST,
        details: { missingMenuIds: ["menu-b", "menu-c"] },
      }
    );
  });
});
