import z from "zod";
import type { OrderItem } from "../../types/orderItem/orderItem.interface";
import { isoDateTime } from "./common.response";
import { orderItemOptionSnapshotSchema } from "./menuOption.response";

/** 주문 항목 응답. `id`·`orderId`·`menuId`는 스키마에 없으므로 parse 시 제거된다. */
export const publicOrderItemSchema = z.object({
  publicId: z.string().describe("주문 항목 고유 ID"),
  menuName: z.string().describe("메뉴 이름"),
  menuImageUrl: z.string().nullable().describe("메뉴 이미지 URL"),
  basePrice: z.number().describe("기본 가격"),
  optionsPrice: z.number().describe("옵션 가격"),
  unitPrice: z.number().describe("단가 (기본 가격 + 옵션 가격)"),
  quantity: z.number().describe("수량"),
  optionsSnapshot: orderItemOptionSnapshotSchema
    .nullable()
    .describe("선택한 옵션 스냅샷"),
  createdAt: isoDateTime().describe("생성일"),
}) satisfies z.ZodType<OrderItem, z.ZodTypeDef, unknown>;
