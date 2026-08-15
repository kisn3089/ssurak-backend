import z from "zod";

export const MENU_DRAFT_ISSUES = [
  "PRICE_MISSING",
  "PRICE_OUT_OF_RANGE",
  "PRICE_ROUNDED",
  "NAME_TRUNCATED",
  "DESCRIPTION_TRUNCATED",
  "CATEGORY_UNKNOWN",
  "DUPLICATE_NAME",
] as const;

export const menuDraftIssueSchema = z.enum(MENU_DRAFT_ISSUES);

export type MenuDraftIssue = z.infer<typeof menuDraftIssueSchema>;

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

export const menuDraftContentSchema = z.object({
  items: z.array(menuDraftItemSchema),
  unreadableCount: z
    .number()
    .describe("메뉴처럼 보였지만 읽지 못한 줄 수. 재촬영 안내에 쓴다."),
});

export type MenuDraftContent = z.infer<typeof menuDraftContentSchema>;

/**
 * 초안 리소스의 상태.
 *
 * 추출이 동기(POST가 결과까지 기다린다)라 `EXTRACTING`은 없다 — 리소스의 존재가 곧 완료다.
 * `COMMITTED`는 일괄 등록까지 끝낸 초안을 뜻하며, 등록 API가 초안을 알게 되면 그때 쓴다.
 */
export const MENU_DRAFT_STATUSES = ["READY", "COMMITTED"] as const;

export const menuDraftStatusSchema = z.enum(MENU_DRAFT_STATUSES);

export type MenuDraftStatus = z.infer<typeof menuDraftStatusSchema>;

export const menuDraftSourceImageSchema = z.object({
  fileName: z.string().describe("업로드 당시 파일명"),
  byteSize: z.number().describe("업로드 원본의 바이트 크기"),
  thumbnail: z.string().describe("목록 카드용 썸네일 data URL(webp)"),
});

export type MenuDraftSourceImage = z.infer<typeof menuDraftSourceImageSchema>;

export const menuDraftSummarySchema = z.object({
  draftId: z.string().describe("초안 식별자. 상세·수정 경로에 그대로 쓴다."),
  status: menuDraftStatusSchema,
  itemCount: z.number().describe("초안에 담긴 메뉴 수"),
  sourceImages: z.array(menuDraftSourceImageSchema),
  createdAt: z.string().datetime().describe("추출 시각"),
  updatedAt: z.string().datetime().describe("마지막 수정 시각"),
  expiresAt: z
    .string()
    .datetime()
    .describe("이 시각 이후 초안은 사라진다. 조회·수정할 때마다 뒤로 밀린다."),
});

export type MenuDraftSummary = z.infer<typeof menuDraftSummarySchema>;

export const menuDraftResponseSchema = menuDraftSummarySchema.merge(
  menuDraftContentSchema
);

export type MenuDraftResponse = z.infer<typeof menuDraftResponseSchema>;

export const menuDraftListResponseSchema = z.object({
  drafts: z.array(menuDraftSummarySchema).describe("최근에 추출한 순서"),
  remaining: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("점주 기준 남은 초안 추출 가능 횟수. null이면 조회에 실패한 것"),
  resetAt: z
    .string()
    .datetime()
    .nullable()
    .describe("횟수가 초기화되는 시각. null이면 아직 쓰지 않았거나 조회 실패"),
  rateLimit: z
    .number()
    .int()
    .nonnegative()
    .describe("점주 기준 초안 추출 가능 최대 횟수."),
  rateWindowHours: z
    .number()
    .int()
    .nonnegative()
    .describe("점주 기준 초안 추출 가능 횟수 초기화 주기(시간)"),
});

export type MenuDraftListResponse = z.infer<typeof menuDraftListResponseSchema>;
