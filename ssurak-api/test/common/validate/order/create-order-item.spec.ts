import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  createOrderItemsWithValidMenu,
  ValidatableOrderItem,
} from "src/common/validate/order/create-order-item";
import { OptionChoiceState, OptionSelectionType } from "@ssurak/db";
import { MenuValidationFields } from "src/common/validate/menu/mismatch";
import { expectHttpException } from "test/helpers/expect-http-exception";

const CDN = "https://cdn.example.com";

/** 사이즈: 필수 단일 선택 (톨 0 / 라지 +500) */
const sizeGroup: MenuValidationFields["options"][number] = {
  publicId: "optsize",
  name: "사이즈",
  selectionType: OptionSelectionType.SINGLE,
  required: true,
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 10,
  enabled: true,
  trigger: null,
  choices: [
    {
      publicId: "chotall",
      name: "톨",
      priceDelta: 0,
      quantityEnabled: false,
      maxQuantity: 1,
      isDefault: true,
      sortOrder: 10,
      state: OptionChoiceState.AVAILABLE,
    },
    {
      publicId: "cholarge",
      name: "라지",
      priceDelta: 500,
      quantityEnabled: false,
      maxQuantity: 1,
      isDefault: false,
      sortOrder: 20,
      state: OptionChoiceState.AVAILABLE,
    },
  ],
};

const menuFixture = (
  overrides: Partial<MenuValidationFields> = {}
): MenuValidationFields => ({
  id: 1n,
  publicId: "menu-americano",
  name: "아메리카노",
  price: 3000,
  imageKey: "menu/americano",
  isAvailable: true,
  options: [sizeGroup],
  ...overrides,
});

describe("createOrderItemsWithValidMenu", () => {
  it("메뉴 스냅샷과 가격이 계산된 Prisma create 입력을 만든다", () => {
    const orderItems: ValidatableOrderItem[] = [
      {
        menuPublicId: "menu-americano",
        quantity: 2,
        options: [
          {
            optionId: "optsize",
            choices: [{ choiceId: "cholarge", quantity: 1 }],
          },
        ],
      },
    ];

    const result = createOrderItemsWithValidMenu(
      orderItems,
      [menuFixture()],
      ["menu-americano"],
      CDN
    );

    expect(result).toEqual([
      {
        menu: { connect: { publicId: "menu-americano" } },
        menuName: "아메리카노",
        menuImageUrl: `${CDN}/menu/americano/thumbnail.webp`,
        basePrice: 3000,
        optionsPrice: 500,
        unitPrice: 3500,
        quantity: 2,
        optionsSnapshot: {
          options: [
            {
              optionId: "optsize",
              name: "사이즈",
              choices: [
                {
                  choiceId: "cholarge",
                  name: "라지",
                  priceDelta: 500,
                  quantity: 1,
                },
              ],
            },
          ],
        },
      },
    ]);
  });

  it("옵션 없는 메뉴는 optionsSnapshot 없이 basePrice가 곧 unitPrice다", () => {
    const simpleMenu = menuFixture({
      publicId: "menu-water",
      name: "생수",
      price: 1000,
      imageKey: null,
      options: [],
    });

    const [result] = createOrderItemsWithValidMenu(
      [{ menuPublicId: "menu-water", quantity: 1 }],
      [simpleMenu],
      ["menu-water"],
      CDN
    );

    expect(result).toMatchObject({
      basePrice: 1000,
      optionsPrice: 0,
      unitPrice: 1000,
      optionsSnapshot: undefined,
    });
  });

  it("조회되지 않은 메뉴가 섞여 있으면 MENU_MISMATCH(400)", () => {
    expectHttpException(
      () =>
        createOrderItemsWithValidMenu(
          [{ menuPublicId: "menu-ghost", quantity: 1 }],
          [menuFixture()],
          ["menu-americano", "menu-ghost"],
          CDN
        ),
      {
        code: "MENU_MISMATCH",
        status: HttpStatus.BAD_REQUEST,
        details: { missingMenuIds: ["menu-ghost"] },
      }
    );
  });

  it("비활성 메뉴가 포함되면 MENU_NOT_AVAILABLE(400)", () => {
    const unavailable = menuFixture({ isAvailable: false });

    expectHttpException(
      () =>
        createOrderItemsWithValidMenu(
          [
            {
              menuPublicId: "menu-americano",
              quantity: 1,
              options: [
                {
                  optionId: "optsize",
                  choices: [{ choiceId: "chotall", quantity: 1 }],
                },
              ],
            },
          ],
          [unavailable],
          ["menu-americano"],
          CDN
        ),
      {
        code: "MENU_NOT_AVAILABLE",
        status: HttpStatus.BAD_REQUEST,
        details: "아메리카노",
      }
    );
  });
});
