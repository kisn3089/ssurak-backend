import z from "zod";
import {
  OptionChoiceState,
  OptionSelectionType,
} from "../../types/menu/menuOptions.interface";
import type {
  MenuOptionChoice,
  MenuOptionGroup,
  MenuOptionTrigger,
  OptionSnapshotGroup,
  OrderItemOptionSnapshot,
} from "../../types/menu/menuOptions.interface";

export const menuOptionTriggerSchema = z.array(
  z.object({
    optionId: z.string().describe("조건이 되는 다른 옵션의 ID"),
    choiceIds: z
      .array(z.string())
      .describe("이 중 하나라도 선택되면 조건 충족 (OR)"),
  })
) satisfies z.ZodType<MenuOptionTrigger, z.ZodTypeDef, unknown>;

export const publicMenuOptionChoiceSchema = z.object({
  publicId: z.string().describe("선택지 고유 ID"),
  name: z.string().describe("선택지 이름"),
  priceDelta: z
    .number()
    .describe("이 선택지가 더하는 금액(개당). 할인 옵션은 음수다."),
  quantityEnabled: z.boolean().describe("수량 선택 사용 여부"),
  maxQuantity: z.number().describe("선택 가능한 최대 수량"),
  isDefault: z.boolean().describe("기본 선택 여부"),
  sortOrder: z.number().describe("옵션 내 정렬 순서"),
  state: z
    .nativeEnum(OptionChoiceState)
    .describe("판매 상태. HIDDEN은 고객 응답에서 제외된다."),
}) satisfies z.ZodType<MenuOptionChoice, z.ZodTypeDef, unknown>;

export const publicMenuOptionGroupSchema = z.object({
  publicId: z.string().describe("옵션 고유 ID"),
  name: z.string().describe("옵션 이름"),
  selectionType: z.nativeEnum(OptionSelectionType).describe("선택 방식"),
  required: z.boolean().describe("필수 선택 여부"),
  minSelect: z.number().describe("최소 선택 개수"),
  maxSelect: z.number().describe("최대 선택 개수"),
  sortOrder: z.number().describe("메뉴 내 정렬 순서"),
  enabled: z.boolean().describe("사용 여부. false면 고객 응답에서 제외된다."),
  trigger: menuOptionTriggerSchema
    .nullable()
    .describe("조건부 노출 규칙. null이면 항상 노출된다."),
  choices: z.array(publicMenuOptionChoiceSchema).describe("선택지 목록"),
}) satisfies z.ZodType<MenuOptionGroup, z.ZodTypeDef, unknown>;

/**
 * 주문·장바구니에 확정 저장되는 옵션 스냅샷.
 * 이름과 금액을 함께 담아 두므로 이후 메뉴 옵션이 바뀌거나 삭제돼도 그대로 렌더된다.
 */
export const optionSnapshotGroupSchema = z.object({
  optionId: z.string(),
  name: z.string(),
  choices: z.array(
    z.object({
      choiceId: z.string(),
      name: z.string(),
      priceDelta: z.number(),
      quantity: z.number(),
    })
  ),
}) satisfies z.ZodType<OptionSnapshotGroup, z.ZodTypeDef, unknown>;

export const orderItemOptionSnapshotSchema = z.object({
  options: z.array(optionSnapshotGroupSchema),
}) satisfies z.ZodType<OrderItemOptionSnapshot, z.ZodTypeDef, unknown>;
