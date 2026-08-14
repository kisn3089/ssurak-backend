import z from "zod";

/**
 * 비전 모델의 응답 스키마
 *
 * 도메인 스키마(createMenuPayloadSchema)를 여기 쓰면 안 된다. 40개 중 1개가
 * 이름 31자라는 이유로 요청 전체가 400이 되기 때문이다. 여기서는 "모양"만 강제하고,
 * 길이·범위 같은 제약은 매핑 단계(menu-draft.mapper)가 항목별로 손질한다.
 *
 * OpenAI structured output(strict)의 제약도 그대로 반영돼 있다:
 * 모든 필드가 required여야 하고(그래서 `.optional()` 대신 `.nullable()`),
 * `.min()`/`.max()`는 강제되지 않는다(설명으로만 모델에 전달된다).
 */
export const extractedMenuItemSchema = z.object({
  name: z
    .string()
    .describe("메뉴 이름. 사진에 적힌 그대로 옮긴다. 30자를 넘기지 않는다."),
  price: z
    .number()
    .nullable()
    .describe(
      "원 단위 정수 가격. 통화 기호·쉼표·'원'은 제거한다. " +
        "'시가'·'별도문의'처럼 숫자가 아니거나 가격이 안 보이면 null."
    ),
  description: z
    .string()
    .nullable()
    .describe(
      "메뉴 이름 아래 부연 설명. 없으면 null. 100자를 넘기지 않는다. " +
        "가격이나 옵션 목록을 여기 넣지 않는다."
    ),
  categoryName: z
    .string()
    .nullable()
    .describe(
      "사진에서 이 메뉴가 속한 분류 제목(예: '찌개류', '주류'). " +
        "분류 제목이 없으면 null. 임의로 지어내지 않는다."
    ),
});

export type ExtractedMenuItem = z.infer<typeof extractedMenuItemSchema>;

export const menuExtractionSchema = z.object({
  items: z
    .array(extractedMenuItemSchema)
    .describe("사진에서 읽어낸 메뉴 목록. 사진에 보이는 순서대로."),
  unreadableCount: z
    .number()
    .describe(
      "메뉴 항목으로 보이지만 흐림·잘림·가림 때문에 읽지 못한 줄 수. 없으면 0."
    ),
});

export type MenuExtraction = z.infer<typeof menuExtractionSchema>;
