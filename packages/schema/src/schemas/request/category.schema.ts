import z from "zod";
import { commonSchema } from "./common.schema";
import { storeIdParamsSchema } from "./store.schema";

const categoryIdParamsSchema = z
  .object({ categoryId: commonSchema.cuid2("Category") })
  .strict();

export const storeIdAndCategoryIdParamsSchema = storeIdParamsSchema.merge(
  categoryIdParamsSchema
);

export type CreateCategoryPayload = z.infer<typeof createCategoryPayloadSchema>;

/**
 * `sortOrder`는 클라이언트가 쓰지 않는다 — 생성은 항상 맨 뒤에 붙고,
 * 순서 변경은 전용 재정렬 엔드포인트로만 한다.
 */
export const createCategoryPayloadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "카테고리 이름은 필수입니다.")
      .max(20, "카테고리 이름은 최대 20자까지 가능합니다."),
  })
  .strict();

export type UpdateCategoryPayload = z.infer<typeof updateCategoryPayloadSchema>;

export const updateCategoryPayloadSchema =
  createCategoryPayloadSchema.partial();

export type ReorderCategoriesPayload = z.infer<
  typeof reorderCategoriesPayloadSchema
>;

export const reorderCategoriesPayloadSchema = z
  .object({
    categoryIds: z
      .array(commonSchema.cuid2("Category"))
      .min(1, "정렬할 카테고리를 하나 이상 보내주세요.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "카테고리 ID가 중복되었습니다."
      ),
  })
  .strict();
