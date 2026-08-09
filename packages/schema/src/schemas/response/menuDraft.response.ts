import z from "zod";

/**
 * 초안 항목에 붙는 "사장님이 손봐야 하는 지점" 표시.
 *
 * 모델이 자체 보고하는 confidence를 쓰지 않는 게 의도적이다 — 자기 보고 신뢰도는
 * 실제 오류율과 상관이 낮다. 아래 값들은 전부 매핑 단계에서 결정적으로 계산되므로
 * 프론트가 그대로 믿고 하이라이트할 수 있다.
 */
export const MENU_DRAFT_ISSUES = [
  /** 가격을 읽지 못했다('시가' 포함). 사장님이 채워야 저장된다. */
  "PRICE_MISSING",
  /** 가격이 도메인 범위(0~1,000만) 밖이라 비웠다. 자릿수 오인식이 대부분이다. */
  "PRICE_OUT_OF_RANGE",
  /** 소수점 가격을 원 단위 정수로 반올림했다. */
  "PRICE_ROUNDED",
  /** 이름이 30자를 넘어 잘랐다. */
  "NAME_TRUNCATED",
  /** 설명이 100자를 넘어 잘랐다. */
  "DESCRIPTION_TRUNCATED",
  /** 분류를 정하지 못했다. 저장 전에 카테고리를 골라야 한다. */
  "CATEGORY_UNKNOWN",
  /** 같은 이름이 매장에 이미 있거나 이번 사진들 안에서 중복됐다. */
  "DUPLICATE_NAME",
] as const;

export const menuDraftIssueSchema = z.enum(MENU_DRAFT_ISSUES);

export type MenuDraftIssue = z.infer<typeof menuDraftIssueSchema>;

/**
 * 초안의 카테고리 귀속. 세 갈래를 구분해야 프론트가 "기존 카테고리에 담김",
 * "새로 만들어짐", "골라주세요"를 서로 다른 UI로 보여줄 수 있다.
 */
export const menuDraftCategorySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("existing"),
    categoryId: z.string().describe("매칭된 기존 카테고리의 publicId"),
    name: z.string().describe("기존 카테고리 이름"),
  }),
  z.object({
    kind: z.literal("new"),
    name: z.string().describe("확정 시 새로 생성될 카테고리 이름"),
  }),
  z.object({ kind: z.literal("unknown") }),
]);

export type MenuDraftCategory = z.infer<typeof menuDraftCategorySchema>;

export const menuDraftItemSchema = z.object({
  name: z.string().describe("메뉴 이름"),
  price: z.number().nullable().describe("가격. 읽지 못했으면 null"),
  description: z.string().nullable().describe("메뉴 설명"),
  category: menuDraftCategorySchema,
  issues: z
    .array(menuDraftIssueSchema)
    .describe("사장님이 확인해야 하는 지점. 비어 있으면 그대로 저장 가능"),
});

export type MenuDraftItem = z.infer<typeof menuDraftItemSchema>;

/**
 * 메뉴판 사진 인식 결과.
 *
 * 이 응답은 DB에 아무것도 쓰지 않는다 — 사장님이 콘솔에서 고친 뒤
 * 일괄 등록(POST .../menus/bulk)으로 확정한다. 모델 출력이 쓰기 경로에
 * 직접 닿지 않으므로 오인식도, 사진에 적힌 프롬프트 인젝션도 데이터를 오염시키지 못한다.
 *
 * 메뉴를 하나도 찾지 못한 경우도 200에 `items: []`다 —
 * "다시 찍어주세요" 안내는 에러 응답보다 정상 응답으로 다루는 편이 낫다.
 */
export const menuDraftResponseSchema = z.object({
  items: z.array(menuDraftItemSchema),
  unreadableCount: z
    .number()
    .describe("메뉴처럼 보였지만 읽지 못한 줄 수. 재촬영 안내에 쓴다."),
});

export type MenuDraftResponse = z.infer<typeof menuDraftResponseSchema>;
