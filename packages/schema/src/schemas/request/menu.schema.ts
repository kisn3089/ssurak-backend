import z from "zod";
import type {
  MenuCustomOptionValue,
  MenuOption,
  MenuOptionValue,
  MenuRequiredOptionValue,
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

const requiredOptionsSchema = z
  .record(z.string(), requiredOptionValuesSchema)
  .nullable();

const customOptionsSchema = z
  .record(z.string(), customOptionValueSchema)
  .nullable();

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
      .nullable()
      .optional(),
    // 업로드 응답으로 받은 임시 키(`tmp/{ownerId}/{cuid}`)를 그대로 실어 보낸다.
    // URL 형식 검증은 의미가 없다 — 서버가 요청자 소유인지를 직접 대조한다.
    // null을 명시하면 이미지를 제거한다(수정 시).
    imageKey: z.string().nullable().optional(),
    categoryId: commonSchema.cuid2("Category"),
    // sortOrder는 클라이언트가 쓰지 않는다 — 생성·카테고리 이동 시 항상 맨 뒤에 붙고,
    // 순서 변경은 재정렬 엔드포인트(PUT .../menus/reorder)로만 한다.
    isAvailable: z.boolean().default(true),
    requiredOptions: requiredOptionsSchema.optional(),
    customOptions: customOptionsSchema.optional(),
  })
  .strict();

export const updateMenuPayloadSchema = createMenuPayloadSchema.partial();

export type ReorderMenusPayload = z.infer<typeof reorderMenusPayloadSchema>;

/**
 * 한 카테고리에 속한 메뉴 전체를 원하는 순서로 나열해 보낸다(부분 목록이 아니다).
 * 서버가 해당 카테고리의 살아 있는 메뉴 집합과 대조하므로, 다른 곳에서 메뉴가
 * 추가·삭제·이동됐다면 409로 거절된다 — 집합 검사가 곧 버전 체크다.
 * 카테고리 간 이동은 여기서 하지 않는다(메뉴 수정의 categoryId로 옮긴 뒤 재정렬한다).
 */
export const reorderMenusPayloadSchema = z
  .object({
    categoryId: commonSchema.cuid2("Category"),
    menuIds: z
      .array(commonSchema.cuid2("Menu"))
      .min(1, "정렬할 메뉴를 하나 이상 보내주세요.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "메뉴 ID가 중복되었습니다."
      ),
  })
  .strict();
