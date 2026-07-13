import z from "zod";
import { commonSchema } from "./common.schema";
import { OrderStatus } from "../../types/order/order.interface";
import { createOrderItemPayloadSchema } from "./orderItem.schema";

export const orderIdParamsSchema = z
  .object({
    orderId: commonSchema.cuid2("Order"),
  })
  .strict();

export const orderItemIdParamsSchema = z
  .object({
    orderItemId: commonSchema.cuid2("OrderItem"),
  })
  .strict();

/** Body Schema */
export const createOrderPayloadSchema = z.object({
  orderItems: createOrderItemPayloadSchema.array(),
  memo: z.string().max(50, "메모는 최대 50자까지 가능합니다.").optional(),
});

/**
 * 고객 주문 생성 Body Schema.
 * orderItems는 보내지 않는다 — 서버가 redis cart(SSOT)를 읽고,
 * cart 버전(session:updatedAt)으로 멱등성을 보장한다.
 */
export const createCustomerOrderPayloadSchema = z.object({
  memo: z.string().max(50, "메모는 최대 50자까지 가능합니다.").optional(),
});

export const updateOrderPayloadSchema = createOrderPayloadSchema
  .omit({ orderItems: true })
  .extend({
    status: z.nativeEnum(OrderStatus),
    cancelledReason: z
      .string()
      .max(50, "취소 사유는 최대 50자까지 가능합니다."),
  })
  .partial()
  .strict();
