import z from "zod";
import type {
  CartWithNoticeResponse,
  CartWithOptionalNoticeResponse,
} from "../../types/cart/cart.interface";
import type { SyncNotice } from "../../types/realtime/syncNotice.interface";
import { cartSchema } from "../request/cart.schema";

export const syncNoticeMessageSchema = z.object({
  owner: z.string().optional().describe("점주용 안내 메시지"),
  customer: z.string().optional().describe("고객용 안내 메시지"),
});

/** 주문·장바구니 변경 시 함께 내려오는 안내. */
export const syncNoticeSchema = z.object({
  level: z.enum(["info", "success", "error"]).describe("안내 레벨"),
  message: syncNoticeMessageSchema.describe("대상별 안내 메시지"),
  sound: z.boolean().optional().describe("알림음 재생 여부"),
}) satisfies z.ZodType<SyncNotice, z.ZodTypeDef, unknown>;

/** 장바구니 변경 응답. 변경 안내가 항상 함께 온다. */
export const cartWithNoticeSchema = z.object({
  cart: cartSchema.describe("장바구니 데이터"),
  notice: syncNoticeSchema.describe("장바구니 변경 안내"),
}) satisfies z.ZodType<CartWithNoticeResponse, z.ZodTypeDef, unknown>;

/** 장바구니 변경 응답. 변경 사항이 없으면 안내가 생략된다. */
export const cartWithOptionalNoticeSchema = z.object({
  cart: cartSchema.describe("장바구니 데이터"),
  notice: syncNoticeSchema
    .optional()
    .describe("장바구니 변경 안내 (변경이 없으면 생략)"),
}) satisfies z.ZodType<CartWithOptionalNoticeResponse, z.ZodTypeDef, unknown>;
