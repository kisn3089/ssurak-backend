import z from "zod";
import {
  OrderStatus,
  type Order,
  type OrderWithItemsResponse,
} from "../../types/order/order.interface";
import { isoDateTime } from "./common.response";
import { publicOrderItemSchema } from "./orderItem.response";

/**
 * 주문 응답.
 * `id`·`storeId`·`tableId`·`tableSessionId`는 스키마에 없으므로 parse 시 제거된다.
 */
export const publicOrderSchema = z.object({
  publicId: z.string().describe("주문 고유 ID"),
  idempotencyKey: z
    .string()
    .nullable()
    .describe("고객 주문 멱등성 키. 관리자 주문은 사용하지 않아 null이다."),
  status: z.nativeEnum(OrderStatus).describe("주문 상태"),
  memo: z.string().nullable().describe("메모"),
  cancelledReason: z.string().nullable().describe("취소 사유"),
  acceptedAt: isoDateTime().nullable().describe("접수 시간"),
  completedAt: isoDateTime().nullable().describe("완료 시간"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
}) satisfies z.ZodType<Order, z.ZodTypeDef, unknown>;

/** 주문 + 주문 항목 응답. */
export const publicOrderWithItemsSchema = publicOrderSchema.extend({
  orderItems: z.array(publicOrderItemSchema).describe("주문 항목 목록"),
}) satisfies z.ZodType<OrderWithItemsResponse, z.ZodTypeDef, unknown>;
