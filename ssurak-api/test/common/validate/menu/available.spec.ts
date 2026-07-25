import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { validateMenuAvailableOrThrow } from "src/common/validate/menu/available";
import { MenuValidationFields } from "src/common/validate/menu/mismatch";
import { expectHttpException } from "test/helpers/expect-http-exception";

const menuFixture = (
  overrides: Partial<MenuValidationFields> = {}
): MenuValidationFields => ({
  id: 1n,
  publicId: "menu-public-id",
  name: "아메리카노",
  price: 3000,
  imageKey: null,
  requiredOptions: null,
  customOptions: null,
  isAvailable: true,
  ...overrides,
});

describe("validateMenuAvailableOrThrow", () => {
  it("판매 중인 메뉴는 통과한다", () => {
    expect(() => validateMenuAvailableOrThrow(menuFixture())).not.toThrow();
  });

  it("비활성 메뉴는 MENU_NOT_AVAILABLE(400)을 던지고 details에 메뉴명을 담는다", () => {
    expectHttpException(
      () => validateMenuAvailableOrThrow(menuFixture({ isAvailable: false })),
      {
        code: "MENU_NOT_AVAILABLE",
        status: HttpStatus.BAD_REQUEST,
        details: "아메리카노",
      }
    );
  });
});
