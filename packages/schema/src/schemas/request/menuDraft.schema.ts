import z from "zod";
import { commonSchema } from "./common.schema";
import { categoryNameSchema } from "./category.schema";
import { menuDescriptionSchema, menuNameSchema } from "./menu.schema";
import { storeIdParamsSchema } from "./store.schema";

export const DRAFT_ID_LENGTH = 22;

export const draftIdSchema = z
  .string()
  .regex(
    new RegExp(`^[A-Za-z0-9_-]{${DRAFT_ID_LENGTH}}$`),
    "draftId 형식이 올바르지 않습니다."
  );

export const storeIdAndDraftIdParamsSchema = storeIdParamsSchema.merge(
  z.object({ draftId: draftIdSchema }).strict()
);

export const BULK_MENU_MAX = 100;

const bulkMenuItemSchema = z
  .object({
    name: menuNameSchema,
    price: commonSchema.menuPrice,
    description: menuDescriptionSchema.nullable().optional(),
    categoryId: commonSchema.cuid2("Category").optional(),
    categoryName: categoryNameSchema.optional(),
    isAvailable: z.boolean().default(true),
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

export const bulkCreateMenusPayloadSchema = z
  .object({
    items: z
      .array(bulkMenuItemSchema)
      .min(1, "등록할 메뉴를 하나 이상 보내주세요.")
      .max(
        BULK_MENU_MAX,
        `한 번에 최대 ${BULK_MENU_MAX}개까지 등록할 수 있습니다.`
      ),
    draftId: draftIdSchema.optional(),
  })
  .strict();

export type BulkCreateMenusPayload = z.infer<
  typeof bulkCreateMenusPayloadSchema
>;

const menuDraftItemPayloadSchema = z
  .object({
    name: menuNameSchema,
    price: commonSchema.menuPrice.nullable(),
    description: menuDescriptionSchema.nullable().optional(),
    categoryId: commonSchema.cuid2("Category").optional(),
    categoryName: categoryNameSchema.optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.categoryId !== undefined && item.categoryName !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message:
          "기존 카테고리(categoryId)와 새 카테고리(categoryName) 중 하나만 지정해 주세요.",
      });
    }
  });

export type MenuDraftItemPayload = z.infer<typeof menuDraftItemPayloadSchema>;

/**
 * 초안 항목 전체 교체.
 * 부분 수정이 아니라 배열 통째 교체다
 */
export const updateMenuDraftPayloadSchema = z
  .object({
    items: z
      .array(menuDraftItemPayloadSchema)
      .max(
        BULK_MENU_MAX,
        `초안에는 최대 ${BULK_MENU_MAX}개까지 담을 수 있습니다.`
      ),
  })
  .strict();

export type UpdateMenuDraftPayload = z.infer<
  typeof updateMenuDraftPayloadSchema
>;
