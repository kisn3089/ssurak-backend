import z from "zod";
import {
  OptionChoiceState,
  OptionSelectionType,
} from "../../types/menu/menuOptions.interface";
import { commonSchema } from "./common.schema";
import { storeIdParamsSchema } from "./store.schema";

const optionIdParamsSchema = z
  .object({ optionId: commonSchema.cuid2("MenuOptionGroup") })
  .strict();

const choiceIdParamsSchema = z
  .object({ choiceId: commonSchema.cuid2("MenuOptionChoice") })
  .strict();

export const storeIdAndOptionIdParamsSchema =
  storeIdParamsSchema.merge(optionIdParamsSchema);

export const storeIdAndChoiceIdParamsSchema =
  storeIdParamsSchema.merge(choiceIdParamsSchema);

/**
 * 조건부 노출 규칙. 참조 대상은 이미 저장된 그룹·선택지여야 하므로 cuid2를 강제한다.
 *
 * 표시 순서와는 무관하다 — 서버가 의존성 순서로 평가하므로 트리거 대상이 화면에서
 * 뒤에 있어도 된다. 대신 순환 참조는 쓰기 시점에 거절한다.
 */
const triggerRuleSchema = z
  .object({
    optionId: commonSchema.cuid2("MenuOptionGroup"),
    choiceIds: z
      .array(commonSchema.cuid2("MenuOptionChoice"))
      .min(1, "트리거 조건에는 선택지가 하나 이상 필요합니다."),
  })
  .strict();

const optionNameSchema = z
  .string()
  .trim()
  .min(1, "옵션 이름은 필수입니다.")
  .max(30, "옵션 이름은 최대 30자까지 가능합니다.");

const choiceNameSchema = z
  .string()
  .trim()
  .min(1, "선택지 이름은 필수입니다.")
  .max(30, "선택지 이름은 최대 30자까지 가능합니다.");

/**
 * 선택지 본문. 그룹 생성 시 중첩으로도, 선택지 추가 API로도 같은 모양을 쓴다.
 * `priceDelta`는 할인 옵션을 위해 음수를 허용한다 — 메뉴가를 넘는 할인은 주문 검증에서 걸린다.
 */
const choiceBodySchema = z
  .object({
    name: choiceNameSchema,
    priceDelta: z.number().int("옵션 금액은 정수여야 합니다.").default(0),
    quantityEnabled: z.boolean().default(false),
    maxQuantity: z.number().int().min(1).max(99).default(1),
    isDefault: z.boolean().default(false),
    state: z.nativeEnum(OptionChoiceState).default(OptionChoiceState.AVAILABLE),
  })
  .strict()
  .superRefine((choice, ctx) => {
    if (!choice.quantityEnabled && choice.maxQuantity !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxQuantity"],
        message: "수량 선택을 쓰지 않는 선택지의 최대 수량은 1이어야 합니다.",
      });
    }

    // 품절·숨김 선택지를 기본 선택으로 두면 고객 화면이 고를 수 없는 값으로 열린다.
    if (choice.isDefault && choice.state !== OptionChoiceState.AVAILABLE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isDefault"],
        message: "판매 중이 아닌 선택지는 기본 선택으로 지정할 수 없습니다.",
      });
    }
  });

export type MenuOptionChoicePayload = z.infer<typeof choiceBodySchema>;

/**
 * 옵션 그룹 생성. 선택지 없는 그룹은 의미가 없으므로 최소 하나를 함께 받는다.
 * 이후 선택지 추가·수정·삭제는 선택지 전용 엔드포인트로 한다.
 *
 * `sortOrder`는 받지 않는다 — 생성은 항상 맨 뒤에 붙고, 순서 변경은 재정렬 전용
 * 엔드포인트로만 한다(메뉴·카테고리와 같은 원칙).
 */
const optionGroupObjectSchema = z
  .object({
    name: optionNameSchema,
    selectionType: z.nativeEnum(OptionSelectionType),
    required: z.boolean().default(false),
    minSelect: z.number().int().min(0).default(0),
    maxSelect: z.number().int().min(1).default(1),
    enabled: z.boolean().default(true),
    trigger: z.array(triggerRuleSchema).nullable().optional(),
    choices: z
      .array(choiceBodySchema)
      .min(1, "옵션에는 선택지가 하나 이상 필요합니다."),
  })
  .strict();

export type CreateMenuOptionPayload = z.infer<typeof optionGroupObjectSchema>;

export const createMenuOptionPayloadSchema =
  optionGroupObjectSchema.superRefine(addOptionGroupIssues);

/**
 * 옵션 그룹 수정. 선택지는 여기서 건드리지 않는다.
 *
 * `.partial()`로 파생하지 않는 이유: selectionType·required·minSelect·maxSelect는 서로를
 * 제약하므로 일부만 보내면 zod 단계에서 정합성을 판단할 수 없다. 저장된 값과 합친 뒤
 * 서버가 검사한다.
 */
export const updateMenuOptionPayloadSchema = z
  .object({
    name: optionNameSchema.optional(),
    selectionType: z.nativeEnum(OptionSelectionType).optional(),
    required: z.boolean().optional(),
    minSelect: z.number().int().min(0).optional(),
    maxSelect: z.number().int().min(1).optional(),
    enabled: z.boolean().optional(),
    trigger: z.array(triggerRuleSchema).nullable().optional(),
  })
  .strict();

export type UpdateMenuOptionPayload = z.infer<
  typeof updateMenuOptionPayloadSchema
>;

export const createOptionChoicePayloadSchema = choiceBodySchema;

export type CreateOptionChoicePayload = z.infer<
  typeof createOptionChoicePayloadSchema
>;

/** 선택지 수정. 교차 제약은 저장값과 합쳐 서버가 검사한다(수정 스키마와 같은 이유). */
export const updateOptionChoicePayloadSchema = z
  .object({
    name: choiceNameSchema.optional(),
    priceDelta: z.number().int("옵션 금액은 정수여야 합니다.").optional(),
    quantityEnabled: z.boolean().optional(),
    maxQuantity: z.number().int().min(1).max(99).optional(),
    isDefault: z.boolean().optional(),
    state: z.nativeEnum(OptionChoiceState).optional(),
  })
  .strict();

export type UpdateOptionChoicePayload = z.infer<
  typeof updateOptionChoicePayloadSchema
>;

/**
 * 한 메뉴의 옵션 전체를 원하는 순서로 나열해 보낸다(부분 목록이 아니다).
 * 서버가 현재 집합과 대조하므로 다른 곳에서 옵션이 추가·삭제됐다면 409로 거절된다 —
 * 집합 검사가 곧 버전 체크다.
 */
export const reorderMenuOptionsPayloadSchema = z
  .object({
    optionIds: z
      .array(commonSchema.cuid2("MenuOptionGroup"))
      .min(1, "정렬할 옵션을 하나 이상 보내주세요.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "옵션 ID가 중복되었습니다."
      ),
  })
  .strict();

export type ReorderMenuOptionsPayload = z.infer<
  typeof reorderMenuOptionsPayloadSchema
>;

export const reorderOptionChoicesPayloadSchema = z
  .object({
    choiceIds: z
      .array(commonSchema.cuid2("MenuOptionChoice"))
      .min(1, "정렬할 선택지를 하나 이상 보내주세요.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "선택지 ID가 중복되었습니다."
      ),
  })
  .strict();

export type ReorderOptionChoicesPayload = z.infer<
  typeof reorderOptionChoicesPayloadSchema
>;

/**
 * 그룹 하나가 자기 완결적으로 만족해야 하는 규칙들.
 * 저장된 값과 합쳐야 판단 가능한 규칙(트리거 참조 유효성·순환)은 서버가 맡는다.
 */
function addOptionGroupIssues(
  group: CreateMenuOptionPayload,
  ctx: z.RefinementCtx
): void {
  const { selectionType, required, minSelect, maxSelect, choices } = group;

  if (minSelect > maxSelect) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minSelect"],
      message: "최소 선택 개수가 최대 선택 개수보다 클 수 없습니다.",
    });
  }

  // SINGLE인데 maxSelect가 2 이상이면 조용히 보정하지 않고 거절한다 —
  // 서버가 값을 바꿔치면 콘솔에 표시된 값과 저장된 값이 달라진다.
  if (selectionType === OptionSelectionType.SINGLE && maxSelect !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxSelect"],
      message: "단일 선택 옵션의 최대 선택 개수는 1이어야 합니다.",
    });
  }

  // required와 minSelect는 같은 사실을 두 번 적은 것이다. 어긋나면 어느 쪽을 믿을지
  // 모호해지므로 쓰기 시점에 일치를 강제한다.
  if (required && minSelect < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minSelect"],
      message: "필수 옵션의 최소 선택 개수는 1 이상이어야 합니다.",
    });
  }
  if (!required && minSelect !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minSelect"],
      message: "필수가 아닌 옵션의 최소 선택 개수는 0이어야 합니다.",
    });
  }

  // 선택지보다 최소 선택 개수가 많으면 이 그룹은 영영 만족될 수 없다.
  if (minSelect > choices.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minSelect"],
      message: "최소 선택 개수가 선택지 수보다 많을 수 없습니다.",
    });
  }

  const names = new Set<string>();
  choices.forEach((choice, index) => {
    if (names.has(choice.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices", index, "name"],
        message: "선택지 이름이 중복되었습니다.",
      });
    }
    names.add(choice.name);
  });

  const defaultLimit =
    selectionType === OptionSelectionType.SINGLE ? 1 : maxSelect;
  if (choices.filter((choice) => choice.isDefault).length > defaultLimit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["choices"],
      message: `기본 선택은 최대 ${defaultLimit}개까지 지정할 수 있습니다.`,
    });
  }
}
