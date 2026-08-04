import z from "zod";
import type { MenuOptionSelection } from "../../types/menu/menuOptions.interface";
import { commonSchema } from "./common.schema";

/**
 * 고객이 고른 옵션. 평면 목록이 아니라 그룹으로 묶어 받는다 — 메뉴 응답과 모양이 1:1이라
 * 클라이언트가 변환할 필요가 없고, 그룹 단위 에러 리포팅과 부분 업데이트 병합이 단순해진다.
 */
export const menuOptionSelectionSchema = z
  .object({
    optionId: commonSchema.cuid2("MenuOptionGroup"),
    choices: z.array(
      z
        .object({
          choiceId: commonSchema.cuid2("MenuOptionChoice"),
          quantity: z
            .number()
            .int()
            .min(1, "옵션 수량은 최소 1 이상이어야 합니다.")
            .default(1),
        })
        .strict()
    ),
  })
  .strict() satisfies z.ZodType<MenuOptionSelection, z.ZodTypeDef, unknown>;

export const menuOptionSelectionsSchema = z
  .array(menuOptionSelectionSchema)
  .superRefine((selections, ctx) => {
    const seenOptionIds = new Set<string>();

    selections.forEach((selection, index) => {
      if (seenOptionIds.has(selection.optionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "optionId"],
          message: "같은 옵션을 두 번 보냈습니다.",
        });
      }
      seenOptionIds.add(selection.optionId);

      const seenChoiceIds = new Set<string>();
      selection.choices.forEach((choice, choiceIndex) => {
        if (seenChoiceIds.has(choice.choiceId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "choices", choiceIndex, "choiceId"],
            message: "같은 선택지를 두 번 보냈습니다. 수량으로 지정해 주세요.",
          });
        }
        seenChoiceIds.add(choice.choiceId);
      });
    });
  });

export const createOrderItemPayloadSchema = z
  .object({
    menuPublicId: commonSchema.cuid2("Menu"),
    quantity: z.number().min(1, "수량은 최소 1 이상이어야 합니다."),
    options: menuOptionSelectionsSchema.optional(),
  })
  .strict();

export const updateOrderItemPayloadSchema = createOrderItemPayloadSchema
  .partial()
  .strict();
