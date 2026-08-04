import { describe, expect, it } from "vitest";
import { createMenuOptionPayloadSchema } from "@ssurak/schema";

/**
 * 옵션 생성 페이로드의 교차 필드 규칙.
 * 저장값과 합쳐야 판단 가능한 규칙(트리거 참조·순환)은 서비스가 맡으므로 여기 없다.
 */

type OptionInput = Parameters<typeof createMenuOptionPayloadSchema.parse>[0];

const choice = (name: string, overrides: object = {}) => ({
  name,
  priceDelta: 0,
  ...overrides,
});

const option = (overrides: object = {}) => ({
  name: "온도",
  selectionType: "SINGLE",
  choices: [choice("HOT", { isDefault: true }), choice("ICE")],
  ...overrides,
});

/** 첫 번째 이슈의 path를 점 표기로 — 어느 필드가 지적됐는지 한눈에 본다. */
const firstIssuePath = (input: OptionInput): string => {
  const result = createMenuOptionPayloadSchema.safeParse(input);
  if (result.success) throw new Error("통과할 것으로 기대하지 않았습니다.");

  return result.error.issues[0].path.join(".");
};

const expectValid = (input: OptionInput) =>
  expect(createMenuOptionPayloadSchema.safeParse(input).success).toBe(true);

describe("createMenuOptionPayloadSchema", () => {
  it("단일 선택 필수 옵션은 통과한다", () => {
    expectValid(option({ required: true, minSelect: 1 }));
  });

  it("sortOrder는 받지 않는다 (생성은 항상 맨 뒤, 순서는 재정렬 API로만)", () => {
    const result = createMenuOptionPayloadSchema.safeParse(
      option({ sortOrder: 10 })
    );

    expect(result.success).toBe(false);
    // .strict()의 unrecognized_keys 이슈는 키가 아니라 객체 위치에 붙는다.
    expect(result.error?.issues[0]).toMatchObject({
      code: "unrecognized_keys",
      keys: ["sortOrder"],
    });
  });

  it("선택지 없는 옵션은 거절한다", () => {
    expect(firstIssuePath(option({ choices: [] }))).toBe("choices");
  });

  it("minSelect가 maxSelect보다 크면 거절한다", () => {
    expect(
      firstIssuePath(
        option({
          selectionType: "MULTIPLE",
          required: true,
          minSelect: 2,
          maxSelect: 1,
        })
      )
    ).toBe("minSelect");
  });

  it("SINGLE인데 maxSelect가 1이 아니면 보정하지 않고 거절한다", () => {
    expect(firstIssuePath(option({ maxSelect: 2 }))).toBe("maxSelect");
  });

  it("required인데 minSelect가 0이면 거절한다", () => {
    expect(firstIssuePath(option({ required: true }))).toBe("minSelect");
  });

  it("required가 아닌데 minSelect가 1 이상이면 거절한다", () => {
    expect(firstIssuePath(option({ minSelect: 1 }))).toBe("minSelect");
  });

  it("최소 선택 개수가 선택지 수보다 많으면(만족 불가) 거절한다", () => {
    expect(
      firstIssuePath(
        option({
          selectionType: "MULTIPLE",
          required: true,
          minSelect: 3,
          maxSelect: 3,
          choices: [choice("HOT"), choice("ICE")],
        })
      )
    ).toBe("minSelect");
  });

  it("선택지 이름이 중복되면 거절한다", () => {
    expect(
      firstIssuePath(option({ choices: [choice("HOT"), choice("HOT")] }))
    ).toBe("choices.1.name");
  });

  it("SINGLE 옵션에 기본 선택이 둘이면 거절한다", () => {
    expect(
      firstIssuePath(
        option({
          choices: [
            choice("HOT", { isDefault: true }),
            choice("ICE", { isDefault: true }),
          ],
        })
      )
    ).toBe("choices");
  });

  it("MULTIPLE 옵션은 maxSelect까지 기본 선택을 허용한다", () => {
    expectValid(
      option({
        selectionType: "MULTIPLE",
        maxSelect: 2,
        choices: [
          choice("HOT", { isDefault: true }),
          choice("ICE", { isDefault: true }),
        ],
      })
    );
  });

  it("판매 중이 아닌 선택지를 기본 선택으로 두면 거절한다", () => {
    expect(
      firstIssuePath(
        option({
          choices: [
            choice("HOT", { isDefault: true, state: "SOLD_OUT" }),
            choice("ICE"),
          ],
        })
      )
    ).toBe("choices.0.isDefault");
  });

  it("수량 선택을 안 쓰는데 maxQuantity가 1이 아니면 거절한다", () => {
    expect(
      firstIssuePath(
        option({ choices: [choice("HOT", { maxQuantity: 3 }), choice("ICE")] })
      )
    ).toBe("choices.0.maxQuantity");
  });

  it("음수 priceDelta(할인 옵션)는 허용한다", () => {
    expectValid(
      option({
        choices: [choice("HOT"), choice("샷 빼기", { priceDelta: -500 })],
      })
    );
  });

  it("트리거 참조는 cuid2 형식이어야 한다 (이미 저장된 옵션만 참조 가능)", () => {
    expect(
      firstIssuePath(
        option({ trigger: [{ optionId: "tmp-id", choiceIds: ["tmp-choice"] }] })
      )
    ).toBe("trigger.0.optionId");
  });

  it("조건 선택지가 빈 트리거 규칙은 거절한다", () => {
    expect(
      firstIssuePath(
        option({
          trigger: [{ optionId: "ecoy9oy3l8pfm6r68rasml3z", choiceIds: [] }],
        })
      )
    ).toBe("trigger.0.choiceIds");
  });
});
