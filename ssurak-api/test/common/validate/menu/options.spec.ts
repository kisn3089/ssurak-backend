import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { getValidatedMenuOptionsSnapshot } from "src/common/validate/menu/options";
import { expectHttpException } from "test/helpers/expect-http-exception";

const requiredOptions = {
  사이즈: {
    options: [
      { key: "톨", price: 0 },
      { key: "라지", price: 500 },
    ],
    defaultKey: "톨",
  },
};

const customOptions = {
  샷: {
    options: [
      { key: "기본", price: 0 },
      { key: "샷추가", price: 500 },
    ],
    defaultKey: "기본",
  },
};

describe("getValidatedMenuOptionsSnapshot", () => {
  it("옵션이 없는 메뉴 + 빈 페이로드면 가격 0, 스냅샷 없음", () => {
    const result = getValidatedMenuOptionsSnapshot(
      { requiredOptions: null, customOptions: null },
      {}
    );

    expect(result.optionsPrice).toBe(0);
    expect(result).not.toHaveProperty("optionsSnapshot");
  });

  it("필수 옵션을 선택하면 가격이 합산되고 스냅샷에 선택값이 담긴다", () => {
    const result = getValidatedMenuOptionsSnapshot(
      { requiredOptions, customOptions: null },
      { requiredOptions: { 사이즈: "라지" } }
    );

    expect(result.optionsPrice).toBe(500);
    expect(result.optionsSnapshot).toEqual({
      requiredOptions: { 사이즈: { key: "라지", price: 500 } },
      customOptions: {},
    });
  });

  it("필수 옵션과 선택 옵션 가격을 모두 합산한다", () => {
    const result = getValidatedMenuOptionsSnapshot(
      { requiredOptions, customOptions },
      {
        requiredOptions: { 사이즈: "라지" },
        customOptions: { 샷: "샷추가" },
      }
    );

    expect(result.optionsPrice).toBe(1000);
    expect(result.optionsSnapshot).toEqual({
      requiredOptions: { 사이즈: { key: "라지", price: 500 } },
      customOptions: { 샷: { key: "샷추가", price: 500 } },
    });
  });

  it("가격이 0인 선택도 스냅샷에는 포함된다", () => {
    const result = getValidatedMenuOptionsSnapshot(
      { requiredOptions, customOptions: null },
      { requiredOptions: { 사이즈: "톨" } }
    );

    expect(result.optionsPrice).toBe(0);
    expect(result.optionsSnapshot).toEqual({
      requiredOptions: { 사이즈: { key: "톨", price: 0 } },
      customOptions: {},
    });
  });

  it("필수 옵션이 누락되면 MENU_OPTIONS_REQUIRED(400)와 누락 키를 던진다", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(
          { requiredOptions, customOptions: null },
          {}
        ),
      {
        code: "MENU_OPTIONS_REQUIRED",
        status: HttpStatus.BAD_REQUEST,
        details: { missingRequiredOptions: ["사이즈"] },
      }
    );
  });

  it("선택 옵션이 없는 메뉴에 customOptions를 보내면 MENU_OPTIONS_SHOULD_BE_EMPTY(400)", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(
          { requiredOptions: null, customOptions: null },
          { customOptions: { 샷: "샷추가" } }
        ),
      {
        code: "MENU_OPTIONS_SHOULD_BE_EMPTY",
        status: HttpStatus.BAD_REQUEST,
        details: { shouldBeEmptyOptions: ["샷"] },
      }
    );
  });

  it("메뉴에 없는 옵션 값을 보내면 MENU_OPTIONS_INVALID(400)와 잘못된 값을 던진다", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(
          { requiredOptions, customOptions: null },
          { requiredOptions: { 사이즈: "메가" } }
        ),
      {
        code: "MENU_OPTIONS_INVALID",
        status: HttpStatus.BAD_REQUEST,
        details: { key: "사이즈", invalidOption: "메가" },
      }
    );
  });

  it("개수는 같아도 필수 키가 빠져 있으면 MENU_OPTIONS_REQUIRED(400)와 누락 키를 던진다", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(
          { requiredOptions, customOptions: null },
          { requiredOptions: { 온도: "핫" } }
        ),
      {
        code: "MENU_OPTIONS_REQUIRED",
        status: HttpStatus.BAD_REQUEST,
        details: { missingRequiredOptions: ["사이즈"] },
      }
    );
  });

  it("필수 키를 모두 채우고 알 수 없는 키를 더 보내면 MENU_OPTIONS_INVALID(400)", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(
          { requiredOptions, customOptions: null },
          { requiredOptions: { 사이즈: "라지", 온도: "핫" } }
        ),
      {
        code: "MENU_OPTIONS_INVALID",
        status: HttpStatus.BAD_REQUEST,
        details: { missingKey: "온도" },
      }
    );
  });

  it("메뉴 옵션 JSON이 스키마와 다르면 파싱 단계에서 던진다", () => {
    const malformedMenu = {
      requiredOptions: { 사이즈: { 잘못된: "구조" } },
      customOptions: null,
    } as unknown as Parameters<typeof getValidatedMenuOptionsSnapshot>[0];

    expect(() => getValidatedMenuOptionsSnapshot(malformedMenu, {})).toThrow();
  });
});
