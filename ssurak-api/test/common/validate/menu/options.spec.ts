import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { OptionChoiceState, OptionSelectionType } from "@ssurak/db";
import type { MenuOptionSelection } from "@ssurak/schema";
import {
  extractSelectionsFromSnapshot,
  getValidatedMenuOptionsSnapshot,
  mergeSelections,
} from "src/common/validate/menu/options";
import type { MenuValidationFields } from "src/common/validate/menu/mismatch";
import { expectHttpException } from "test/helpers/expect-http-exception";

type OptionGroup = MenuValidationFields["options"][number];
type OptionChoice = OptionGroup["choices"][number];

const choice = (
  publicId: string,
  name: string,
  overrides: Partial<OptionChoice> = {}
): OptionChoice => ({
  publicId,
  name,
  priceDelta: 0,
  quantityEnabled: false,
  maxQuantity: 1,
  isDefault: false,
  sortOrder: 10,
  state: OptionChoiceState.AVAILABLE,
  ...overrides,
});

const group = (
  publicId: string,
  name: string,
  choices: OptionChoice[],
  overrides: Partial<OptionGroup> = {}
): OptionGroup => ({
  publicId,
  name,
  selectionType: OptionSelectionType.SINGLE,
  required: false,
  minSelect: 0,
  maxSelect: 1,
  sortOrder: 10,
  enabled: true,
  trigger: null,
  choices,
  ...overrides,
});

const menuOf = (
  options: OptionGroup[],
  price = 3000
): MenuValidationFields => ({
  id: 1n,
  publicId: "menu1",
  name: "아메리카노",
  price,
  imageKey: null,
  isAvailable: true,
  options,
});

/** 사이즈: 필수 단일 선택 (톨 0 / 라지 +500) */
const sizeGroup = group(
  "optsize",
  "사이즈",
  [
    choice("chotall", "톨", { isDefault: true }),
    choice("cholarge", "라지", { priceDelta: 500 }),
  ],
  { required: true, minSelect: 1 }
);

/** 토핑: 0~2개 복수 선택. 초코칩은 수량 3개까지, 쿠키는 품절, 비공개는 숨김 */
const toppingGroup = group(
  "opttopping",
  "토핑",
  [
    choice("chochip", "초코칩", {
      priceDelta: 300,
      quantityEnabled: true,
      maxQuantity: 3,
    }),
    choice("chocookie", "쿠키", {
      priceDelta: 500,
      state: OptionChoiceState.SOLD_OUT,
    }),
    choice("chosecret", "비공개", {
      priceDelta: 100,
      state: OptionChoiceState.HIDDEN,
    }),
  ],
  { selectionType: OptionSelectionType.MULTIPLE, maxSelect: 2, sortOrder: 20 }
);

const select = (
  optionId: string,
  ...choices: [string, number?][]
): MenuOptionSelection => ({
  optionId,
  choices: choices.map(([choiceId, quantity = 1]) => ({ choiceId, quantity })),
});

describe("getValidatedMenuOptionsSnapshot", () => {
  it("옵션이 없는 메뉴 + 빈 선택이면 가격 0, 스냅샷 없음", () => {
    const result = getValidatedMenuOptionsSnapshot(menuOf([]), undefined);

    expect(result.optionsPrice).toBe(0);
    expect(result).not.toHaveProperty("optionsSnapshot");
  });

  it("필수 옵션을 선택하면 가격이 합산되고 스냅샷에 이름·금액이 담긴다", () => {
    const result = getValidatedMenuOptionsSnapshot(menuOf([sizeGroup]), [
      select("optsize", ["cholarge"]),
    ]);

    expect(result.optionsPrice).toBe(500);
    expect(result.optionsSnapshot).toEqual({
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
    });
  });

  it("가격이 0인 선택도 스냅샷에는 포함된다", () => {
    const result = getValidatedMenuOptionsSnapshot(menuOf([sizeGroup]), [
      select("optsize", ["chotall"]),
    ]);

    expect(result.optionsPrice).toBe(0);
    expect(result.optionsSnapshot?.options[0].choices).toEqual([
      { choiceId: "chotall", name: "톨", priceDelta: 0, quantity: 1 },
    ]);
  });

  it("복수 선택은 priceDelta × quantity 를 모두 합산한다", () => {
    const result = getValidatedMenuOptionsSnapshot(
      menuOf([sizeGroup, toppingGroup]),
      [select("optsize", ["cholarge"]), select("opttopping", ["chochip", 3])]
    );

    // 라지 500 + 초코칩 300 × 3
    expect(result.optionsPrice).toBe(1400);
  });

  it("스냅샷은 페이로드 순서가 아니라 메뉴 정렬 순서를 따른다", () => {
    const result = getValidatedMenuOptionsSnapshot(
      menuOf([sizeGroup, toppingGroup]),
      [select("opttopping", ["chochip"]), select("optsize", ["chotall"])]
    );

    expect(result.optionsSnapshot?.options.map((o) => o.optionId)).toEqual([
      "optsize",
      "opttopping",
    ]);
  });

  it("선택지가 하나도 없는 그룹은 스냅샷에 넣지 않는다", () => {
    const result = getValidatedMenuOptionsSnapshot(menuOf([toppingGroup]), [
      select("opttopping"),
    ]);

    expect(result).not.toHaveProperty("optionsSnapshot");
    expect(result.optionsPrice).toBe(0);
  });

  it("필수 옵션이 누락되면 MENU_OPTIONS_REQUIRED(400)와 누락 ID를 던진다", () => {
    expectHttpException(
      () => getValidatedMenuOptionsSnapshot(menuOf([sizeGroup]), undefined),
      {
        code: "MENU_OPTIONS_REQUIRED",
        status: HttpStatus.BAD_REQUEST,
        details: { missingOptionIds: ["optsize"] },
      }
    );
  });

  it("최대 선택 개수를 넘기면 MENU_OPTION_SELECT_COUNT_INVALID(400)", () => {
    const wideTopping = { ...toppingGroup, maxSelect: 1 };

    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([wideTopping]), [
          select("opttopping", ["chochip"], ["chocookie"]),
        ]),
      {
        code: "MENU_OPTION_SELECT_COUNT_INVALID",
        status: HttpStatus.BAD_REQUEST,
        details: {
          optionId: "opttopping",
          minSelect: 0,
          maxSelect: 1,
          selected: 2,
        },
      }
    );
  });

  it("최소 선택 개수에 못 미치면 MENU_OPTION_SELECT_COUNT_INVALID(400)", () => {
    const twoAtLeast = {
      ...toppingGroup,
      required: true,
      minSelect: 2,
      maxSelect: 2,
    };

    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([twoAtLeast]), [
          select("opttopping", ["chochip"]),
        ]),
      {
        code: "MENU_OPTION_SELECT_COUNT_INVALID",
        status: HttpStatus.BAD_REQUEST,
      }
    );
  });

  it("품절 선택지를 고르면 MENU_OPTION_CHOICE_SOLD_OUT(400)", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([toppingGroup]), [
          select("opttopping", ["chocookie"]),
        ]),
      {
        code: "MENU_OPTION_CHOICE_SOLD_OUT",
        status: HttpStatus.BAD_REQUEST,
        details: {
          optionId: "opttopping",
          choiceId: "chocookie",
          name: "쿠키",
        },
      }
    );
  });

  it("숨김 선택지는 존재를 흘리지 않고 MENU_OPTIONS_INVALID(400)로 응답한다", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([toppingGroup]), [
          select("opttopping", ["chosecret"]),
        ]),
      {
        code: "MENU_OPTIONS_INVALID",
        status: HttpStatus.BAD_REQUEST,
        details: { optionId: "opttopping", invalidChoiceId: "chosecret" },
      }
    );
  });

  it("수량 선택을 지원하지 않는 선택지에 2개를 보내면 MENU_OPTION_QUANTITY_INVALID(400)", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([sizeGroup]), [
          select("optsize", ["cholarge", 2]),
        ]),
      { code: "MENU_OPTION_QUANTITY_INVALID", status: HttpStatus.BAD_REQUEST }
    );
  });

  it("최대 수량을 넘기면 MENU_OPTION_QUANTITY_INVALID(400)", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([toppingGroup]), [
          select("opttopping", ["chochip", 4]),
        ]),
      {
        code: "MENU_OPTION_QUANTITY_INVALID",
        status: HttpStatus.BAD_REQUEST,
        details: {
          choiceId: "chochip",
          quantity: 4,
          maxQuantity: 3,
          quantityEnabled: true,
        },
      }
    );
  });

  it("비활성 그룹에 선택을 보내면 MENU_OPTION_GROUP_DISABLED(400)", () => {
    const disabled = { ...toppingGroup, enabled: false };

    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([disabled]), [
          select("opttopping", ["chochip"]),
        ]),
      {
        code: "MENU_OPTION_GROUP_DISABLED",
        status: HttpStatus.BAD_REQUEST,
        details: { optionId: "opttopping" },
      }
    );
  });

  it("메뉴에 없는 옵션 그룹을 보내면 MENU_OPTIONS_INVALID(400)", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([sizeGroup]), [
          select("optsize", ["chotall"]),
          select("optunknown", ["chox"]),
        ]),
      {
        code: "MENU_OPTIONS_INVALID",
        status: HttpStatus.BAD_REQUEST,
        details: { unknownOptionId: "optunknown" },
      }
    );
  });

  it("메뉴에 없는 선택지를 보내면 MENU_OPTIONS_INVALID(400)", () => {
    expectHttpException(
      () =>
        getValidatedMenuOptionsSnapshot(menuOf([sizeGroup]), [
          select("optsize", ["chomega"]),
        ]),
      {
        code: "MENU_OPTIONS_INVALID",
        status: HttpStatus.BAD_REQUEST,
        details: { optionId: "optsize", invalidChoiceId: "chomega" },
      }
    );
  });

  describe("트리거", () => {
    const sauceGroup = group(
      "optsauce",
      "소스",
      [choice("chochoco", "초코 소스", { priceDelta: 200 })],
      {
        sortOrder: 30,
        trigger: [{ optionId: "opttopping", choiceIds: ["chochip"] }],
      }
    );

    it("선행 옵션이 충족되면 해당 그룹을 선택할 수 있다", () => {
      const result = getValidatedMenuOptionsSnapshot(
        menuOf([toppingGroup, sauceGroup]),
        [select("opttopping", ["chochip"]), select("optsauce", ["chochoco"])]
      );

      expect(result.optionsPrice).toBe(500);
    });

    it("선행 옵션이 충족되지 않았는데 선택을 보내면 MENU_OPTION_TRIGGER_UNSATISFIED(400)", () => {
      expectHttpException(
        () =>
          getValidatedMenuOptionsSnapshot(menuOf([toppingGroup, sauceGroup]), [
            select("optsauce", ["chochoco"]),
          ]),
        {
          code: "MENU_OPTION_TRIGGER_UNSATISFIED",
          status: HttpStatus.BAD_REQUEST,
          details: { optionId: "optsauce" },
        }
      );
    });

    it("참조 대상이 표시 순서상 뒤에 있어도 의존성 순서로 평가한다", () => {
      // 소스(10)가 토핑(20)을 참조한다 — 재정렬로 순서가 뒤집혀도 규칙이 살아야 한다.
      const earlySauce = { ...sauceGroup, sortOrder: 10 };
      const lateTopping = { ...toppingGroup, sortOrder: 20 };

      const result = getValidatedMenuOptionsSnapshot(
        menuOf([earlySauce, lateTopping]),
        [select("opttopping", ["chochip"]), select("optsauce", ["chochoco"])]
      );

      expect(result.optionsPrice).toBe(500);
      // 스냅샷은 평가 순서가 아니라 표시 순서를 따른다(장바구니 지문 정규화).
      expect(result.optionsSnapshot?.options.map((o) => o.optionId)).toEqual([
        "optsauce",
        "opttopping",
      ]);
    });

    it("순환 참조가 남아 있어도 무한 재귀 없이 미충족으로 처리한다", () => {
      // 쓰기 시점에 막지만, 과거 데이터가 깨져 있어도 500이 나면 안 된다.
      const first = group("optone", "A", [choice("choa", "a")], {
        trigger: [{ optionId: "opttwo", choiceIds: ["chob"] }],
      });
      const second = group("opttwo", "B", [choice("chob", "b")], {
        sortOrder: 20,
        trigger: [{ optionId: "optone", choiceIds: ["choa"] }],
      });

      const result = getValidatedMenuOptionsSnapshot(
        menuOf([first, second]),
        undefined
      );

      expect(result.optionsPrice).toBe(0);
      expect(result).not.toHaveProperty("optionsSnapshot");
    });

    it("선행 옵션이 충족되지 않으면 필수 그룹이라도 선택 의무가 면제된다", () => {
      const requiredSauce = { ...sauceGroup, required: true, minSelect: 1 };

      const result = getValidatedMenuOptionsSnapshot(
        menuOf([toppingGroup, requiredSauce]),
        [select("opttopping")]
      );

      expect(result.optionsPrice).toBe(0);
      expect(result).not.toHaveProperty("optionsSnapshot");
    });

    /**
     * 부분 수정에서는 병합으로 딸려온 저장된 선택이 섞인다. 이 둘을 구분하지 않으면
     * 조건이 되는 그룹을 바꾸는 요청이 스스로 막힌다 — 토핑을 바꾸는 순간 저장돼 있던
     * 소스 선택이 미충족이 되어 400을 던지기 때문이다.
     */
    it("병합으로 딸려온 선택은 조건이 깨지면 조용히 버린다", () => {
      const result = getValidatedMenuOptionsSnapshot(
        menuOf([toppingGroup, sauceGroup]),
        // 저장된 소스 선택 + 이번에 보낸 토핑 변경(초코칩 → 쿠키가 아니라 선택 비움)
        [select("opttopping"), select("optsauce", ["chochoco"])],
        { explicitOptionIds: new Set(["opttopping"]) }
      );

      expect(result.optionsPrice).toBe(0);
      expect(result).not.toHaveProperty("optionsSnapshot");
    });

    it("직접 보낸 선택은 조건이 깨졌으면 그대로 400을 던진다", () => {
      expectHttpException(
        () =>
          getValidatedMenuOptionsSnapshot(
            menuOf([toppingGroup, sauceGroup]),
            [select("optsauce", ["chochoco"])],
            { explicitOptionIds: new Set(["optsauce"]) }
          ),
        {
          code: "MENU_OPTION_TRIGGER_UNSATISFIED",
          status: HttpStatus.BAD_REQUEST,
          details: { optionId: "optsauce" },
        }
      );
    });

    /** 조건이 되는 그룹이 스냅샷에서 빠지면 그걸 참조하던 그룹도 함께 떨어진다. */
    it("연쇄로 조건이 깨진 그룹까지 함께 버린다", () => {
      const extraGroup = group(
        "optextra",
        "추가 소스",
        [choice("choextra", "소스 더", { priceDelta: 100 })],
        {
          sortOrder: 40,
          trigger: [{ optionId: "optsauce", choiceIds: ["chochoco"] }],
        }
      );

      const result = getValidatedMenuOptionsSnapshot(
        menuOf([toppingGroup, sauceGroup, extraGroup]),
        [
          select("opttopping"),
          select("optsauce", ["chochoco"]),
          select("optextra", ["choextra"]),
        ],
        { explicitOptionIds: new Set(["opttopping"]) }
      );

      expect(result.optionsPrice).toBe(0);
      expect(result).not.toHaveProperty("optionsSnapshot");
    });
  });

  describe("비활성·삭제된 그룹의 저장된 선택", () => {
    it("점주가 그룹을 끈 뒤라면 저장된 선택을 버리고 통과한다", () => {
      const disabled = { ...toppingGroup, enabled: false };

      const result = getValidatedMenuOptionsSnapshot(
        menuOf([sizeGroup, disabled]),
        [select("optsize", ["chotall"]), select("opttopping", ["chochip"])],
        { explicitOptionIds: new Set(["optsize"]) }
      );

      expect(result.optionsPrice).toBe(0);
      expect(result.optionsSnapshot?.options.map((o) => o.optionId)).toEqual([
        "optsize",
      ]);
    });

    /**
     * 점주가 그룹을 지우면 저장된 스냅샷에만 남는다. 이걸 오류로 다루면 수량만 바꾸는
     * 요청까지 막혀 그 항목을 영원히 수정할 수 없게 된다.
     */
    it("메뉴에서 사라진 그룹의 저장된 선택은 무시한다", () => {
      const result = getValidatedMenuOptionsSnapshot(
        menuOf([sizeGroup]),
        [select("optsize", ["chotall"]), select("optgone", ["chogone"])],
        { explicitOptionIds: new Set() }
      );

      expect(result.optionsSnapshot?.options.map((o) => o.optionId)).toEqual([
        "optsize",
      ]);
    });

    it("직접 보낸 미지의 그룹은 그대로 400을 던진다", () => {
      expectHttpException(
        () =>
          getValidatedMenuOptionsSnapshot(
            menuOf([sizeGroup]),
            [select("optsize", ["chotall"]), select("optgone", ["chogone"])],
            { explicitOptionIds: new Set(["optgone"]) }
          ),
        {
          code: "MENU_OPTIONS_INVALID",
          status: HttpStatus.BAD_REQUEST,
          details: { unknownOptionId: "optgone" },
        }
      );
    });
  });

  describe("할인 옵션(음수 priceDelta)", () => {
    const discountGroup = group("optdiscount", "할인", [
      choice("chodiscount", "샷 빼기", { priceDelta: -500 }),
    ]);

    it("음수 priceDelta가 옵션 합계에서 차감된다", () => {
      const result = getValidatedMenuOptionsSnapshot(menuOf([discountGroup]), [
        select("optdiscount", ["chodiscount"]),
      ]);

      expect(result.optionsPrice).toBe(-500);
    });

    it("단가가 음수가 되면 MENU_OPTION_PRICE_UNDERFLOW(400)", () => {
      expectHttpException(
        () =>
          getValidatedMenuOptionsSnapshot(menuOf([discountGroup], 300), [
            select("optdiscount", ["chodiscount"]),
          ]),
        {
          code: "MENU_OPTION_PRICE_UNDERFLOW",
          status: HttpStatus.BAD_REQUEST,
          details: { price: 300, optionsPrice: -500 },
        }
      );
    });
  });
});

describe("extractSelectionsFromSnapshot", () => {
  it("스냅샷이 없으면 undefined", () => {
    expect(extractSelectionsFromSnapshot(null)).toBeUndefined();
    expect(extractSelectionsFromSnapshot({ options: [] })).toBeUndefined();
  });

  it("스냅샷 → 선택 페이로드 → 스냅샷 왕복이 동일한 결과를 낸다", () => {
    const menu = menuOf([sizeGroup, toppingGroup]);
    const first = getValidatedMenuOptionsSnapshot(menu, [
      select("optsize", ["cholarge"]),
      select("opttopping", ["chochip", 2]),
    ]);

    const restored = getValidatedMenuOptionsSnapshot(
      menu,
      extractSelectionsFromSnapshot(first.optionsSnapshot)
    );

    expect(restored).toEqual(first);
  });
});

describe("mergeSelections", () => {
  const base = [
    select("optsize", ["chotall"]),
    select("opttopping", ["chochip"]),
  ];

  it("patch가 없으면 base를 그대로 돌려준다", () => {
    expect(mergeSelections(base, undefined)).toBe(base);
  });

  it("patch에 있는 그룹만 덮어쓰고 나머지는 유지한다", () => {
    const merged = mergeSelections(base, [select("optsize", ["cholarge"])]);

    expect(merged).toEqual([
      select("optsize", ["cholarge"]),
      select("opttopping", ["chochip"]),
    ]);
  });

  it("빈 choices를 보내면 그 그룹의 선택만 비운다", () => {
    const merged = mergeSelections(base, [select("opttopping")]);

    expect(merged).toEqual([
      select("optsize", ["chotall"]),
      select("opttopping"),
    ]);
  });
});
