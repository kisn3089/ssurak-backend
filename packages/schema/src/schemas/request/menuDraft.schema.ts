import z from "zod";
import { commonSchema } from "./common.schema";
import { categoryNameSchema } from "./category.schema";
import { menuDescriptionSchema, menuNameSchema } from "./menu.schema";

/**
 * 한 요청에 담을 수 있는 메뉴 수.
 *
 * 트랜잭션 하나에 들어가는 쓰기량의 상한이다. 메뉴판 한 장이 100개를 넘는 경우는
 * 드물고, 넘는다면 사진을 나눠 올리는 편이 트랜잭션 타임아웃보다 낫다.
 */
export const BULK_MENU_MAX = 100;

/**
 * 일괄 등록 항목.
 *
 * 카테고리는 기존 것에 붙이거나(`categoryId`) 새로 만든다(`categoryName`).
 * 둘 다 없으면 어디에 넣을지 정할 수 없고, 둘 다 있으면 어느 쪽이 이기는지가
 * 모호해진다 — 그래서 정확히 하나만 받는다.
 */
const bulkMenuItemSchema = z
  .object({
    name: menuNameSchema,
    price: commonSchema.menuPrice,
    description: menuDescriptionSchema.nullable().optional(),
    categoryId: commonSchema.cuid2("Category").optional(),
    categoryName: categoryNameSchema.optional(),
    isAvailable: z.boolean().default(true),
    // 초안에는 메뉴 이미지가 없다. 사진 한 장에서 메뉴별 대표 사진을 오려내는 건
    // 별개 문제라, 이미지는 등록 후 개별 수정으로 붙인다.
  })
  .strict()
  .superRefine((item, ctx) => {
    const hasId = item.categoryId !== undefined;
    const hasName = item.categoryName !== undefined;

    if (hasId === hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: hasId
          ? "기존 카테고리(categoryId)와 새 카테고리(categoryName) 중 하나만 지정해 주세요."
          : "카테고리를 지정해 주세요.",
      });
    }
  });

export type BulkMenuItem = z.infer<typeof bulkMenuItemSchema>;

/**
 * 메뉴판 사진 초안을 확정해 한 번에 등록한다.
 *
 * 초안 응답과 달리 여기서는 도메인 제약을 그대로 강제한다 — 이 단계의 400은
 * 사장님이 편집한 값이 실제로 잘못됐다는 뜻이라 정상 동작이다.
 */
export const bulkCreateMenusPayloadSchema = z
  .object({
    items: z
      .array(bulkMenuItemSchema)
      .min(1, "등록할 메뉴를 하나 이상 보내주세요.")
      .max(
        BULK_MENU_MAX,
        `한 번에 최대 ${BULK_MENU_MAX}개까지 등록할 수 있습니다.`
      ),
  })
  .strict();

export type BulkCreateMenusPayload = z.infer<
  typeof bulkCreateMenusPayloadSchema
>;
