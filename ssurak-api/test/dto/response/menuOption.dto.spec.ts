import { OptionChoiceState, OptionSelectionType } from "@ssurak/db";
import { describe, expect, it } from "vitest";
import {
  PublicMenuOptionDto,
  PublicOptionChoiceDto,
} from "src/dto/response/menuOption.dto";

/** Prisma가 돌려주는 선택지 row. 내부 id는 omit으로 이미 빠져 있다. */
const choiceRowFixture = (overrides: object = {}) => ({
  publicId: "chotall",
  name: "톨",
  priceDelta: 0,
  quantityEnabled: false,
  maxQuantity: 1,
  isDefault: true,
  sortOrder: 10,
  state: OptionChoiceState.AVAILABLE,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const optionRowFixture = (overrides: object = {}) => ({
  publicId: "optsize",
  name: "사이즈",
  selectionType: OptionSelectionType.SINGLE,
  required: true,
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 10,
  enabled: true,
  trigger: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  choices: [choiceRowFixture()],
  ...overrides,
});

describe("PublicMenuOptionDto.schema", () => {
  it("옵션 그룹과 선택지를 통과시킨다", () => {
    const parsed = PublicMenuOptionDto.schema.parse(optionRowFixture());

    expect(parsed).toMatchObject({
      publicId: "optsize",
      selectionType: "SINGLE",
      required: true,
    });
    expect(parsed.choices).toHaveLength(1);
  });

  it("잘못된 선택지 구조는 거부한다", () => {
    expect(() =>
      PublicMenuOptionDto.schema.parse(
        optionRowFixture({ choices: [{ publicId: "chotall", 잘못된: "구조" }] })
      )
    ).toThrow();
  });

  it("트리거 규칙을 그대로 내려준다", () => {
    const trigger = [{ optionId: "optbean", choiceIds: ["chokenya"] }];
    const parsed = PublicMenuOptionDto.schema.parse(
      optionRowFixture({ trigger })
    );

    expect(parsed.trigger).toEqual(trigger);
  });
});

describe("PublicOptionChoiceDto.schema", () => {
  it("부모 옵션 ID는 응답에 없다 (중첩 구조로 이미 알 수 있다)", () => {
    const parsed = PublicOptionChoiceDto.schema.parse(
      choiceRowFixture({ optionId: "optsize" })
    );

    expect(parsed).not.toHaveProperty("optionId");
    expect(parsed.publicId).toBe("chotall");
  });

  it("품절 상태를 그대로 내려준다 (점주는 숨김까지 본다)", () => {
    const parsed = PublicOptionChoiceDto.schema.parse(
      choiceRowFixture({ state: OptionChoiceState.HIDDEN, isDefault: false })
    );

    expect(parsed.state).toBe(OptionChoiceState.HIDDEN);
  });
});
