import z from "zod";
import type {
  MenuCustomOption,
  MenuCustomOptionValue,
  MenuOption,
  MenuOptionValue,
  MenuRequiredOptionValue,
  MenuRequiredOption,
} from "../../types/menu/menuOptions.interface";
import { commonSchema } from "./common.schema";
import { storeIdParamsSchema } from "./store.schema";

const menuIdParamsSchema = z
  .object({ menuId: commonSchema.cuid2("Menu") })
  .strict();

const optionSchema = z
  .object({
    key: z.string(),
    description: z.string().optional(),
    price: z.number(),
  })
  .strict() satisfies z.ZodType<MenuOptionValue>;

const requiredOptionValuesSchema = z.object({
  options: z.array(optionSchema),
  defaultKey: z.string(),
}) satisfies z.ZodType<MenuRequiredOptionValue>;

const triggerSchema = z
  .object({ group: z.string(), in: z.array(z.string()) })
  .strict();

const customOptionValueSchema = z
  .object({
    options: z.array(optionSchema),
    trigger: z.array(triggerSchema).optional(),
    defaultKey: z.string(),
  })
  .strict() satisfies z.ZodType<MenuCustomOptionValue>;

const requiredOptionsSchema = z.record(
  z.string(),
  requiredOptionValuesSchema
) satisfies z.ZodType<MenuRequiredOption>;

const customOptionsSchema = z.record(
  z.string(),
  customOptionValueSchema
) satisfies z.ZodType<MenuCustomOption>;

export const menuOptionsPayloadSchema = z.object({
  requiredOptions: requiredOptionsSchema.nullable(),
  customOptions: customOptionsSchema.nullable(),
}) satisfies z.ZodType<MenuOption>;

export const storeIdAndMenuIdParamsSchema =
  storeIdParamsSchema.merge(menuIdParamsSchema);

export const createMenuPayloadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "메뉴 이름은 필수입니다.")
      .max(30, "메뉴 이름은 최대 30자까지 가능합니다."),
    price: z.number().min(0, "메뉴 가격은 0원 이상이어야 합니다."),
    description: z
      .string()
      .max(100, "메뉴 설명은 최대 100자까지 가능합니다.")
      .optional(),
    // 업로드 응답으로 받은 임시 키(`tmp/{ownerId}/{cuid}`)를 그대로 실어 보낸다.
    // URL 형식 검증은 의미가 없다 — 서버가 요청자 소유인지를 직접 대조한다.
    // null을 명시하면 이미지를 제거한다(수정 시).
    imageKey: z.string().nullable().optional(),
    categoryId: commonSchema.cuid2("Category"),
    sortOrder: z.number().min(0, "정렬 순서는 0 이상이어야 합니다.").optional(),
    isAvailable: z.boolean().default(true),
    requiredOptions: requiredOptionsSchema.optional(),
    customOptions: customOptionsSchema.optional(),
  })
  .strict();

export const updateMenuPayloadSchema = createMenuPayloadSchema.partial();
