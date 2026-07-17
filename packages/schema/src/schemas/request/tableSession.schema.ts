import z from "zod";
import { TableSessionStatus } from "../../types/tableSession/tableSession.interface";
import { commonSchema } from "./common.schema";
import { storeIdParamsSchema } from "./store.schema";

// 32 bytes base64url encoding = 43 characters
export const sessionTokenSchema = z.string().length(43);
export const sessionTokenParamsSchema = z
  .object({
    sessionToken: sessionTokenSchema,
  })
  .strict();

export const createSessionSchema = z
  .object({
    qrCode: commonSchema.cuid2("QRCode"),
  })
  .strict();

export const updateReactivateSchema = z
  .object({ status: z.literal("REACTIVATE") })
  .strict();

export const updateDeactivateSchema = z
  .object({ status: z.literal(TableSessionStatus.CLOSED) })
  .strict();

export const updateActivateSchema = z
  .object({
    status: z.literal(TableSessionStatus.ACTIVE),
    paidAmount: z
      .number()
      .min(0, "결제할 금액은 0원 이상이어야 합니다.")
      .optional(),
  })
  .strict();

export const updateCustomerActivateSchema = z
  .object({ status: z.literal(TableSessionStatus.ACTIVE) })
  .strict();

export const updateExtendsExpireAtSchema = z
  .object({ status: z.literal("EXTEND_EXPIRES_AT") })
  .strict();

/**
 * 결제 처리 명령. DB 상태가 아닌 API 명령 리터럴이다
 * (EXTEND_EXPIRES_AT, REACTIVATE와 동일한 부류) — 처리 결과 세션은 CLOSED가 된다.
 */
export const updateSessionPaymentSchema = z
  .object({ status: z.literal("PAYMENT_PENDING") })
  .strict();

export const updateSessionPayloadSchema = z.discriminatedUnion("status", [
  updateReactivateSchema,
  updateDeactivateSchema,
  updateActivateSchema,
  updateExtendsExpireAtSchema,
  updateSessionPaymentSchema,
]);

export const updateCustomerSessionPayloadSchema = z.discriminatedUnion(
  "status",
  [
    updateCustomerActivateSchema,
    updateExtendsExpireAtSchema,
    updateSessionPaymentSchema,
  ]
);

export const sessionIdSchema = z
  .object({ sessionId: commonSchema.cuid2("TableSession") })
  .strict();

export const storeIdAndSessionIdSchema =
  storeIdParamsSchema.merge(sessionIdSchema);
