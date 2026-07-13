import z from "zod";
import {
  TableSessionStatus,
  type TableSession,
} from "../../types/tableSession/tableSession.interface";
import type { BoardSessionWithOrdersResponse } from "../../types/board/board.interface";
import { isoDateTime } from "./common.response";
import { publicOrderWithItemsSchema } from "./order.response";

/** 테이블 세션 응답. `id`·`tableId`와 관계 필드는 스키마에 없으므로 parse 시 제거된다. */
export const publicTableSessionSchema = z.object({
  publicId: z.string().describe("세션 고유 ID"),
  status: z.nativeEnum(TableSessionStatus).describe("세션 상태"),
  sessionToken: z.string().describe("세션 토큰"),
  activatedAt: isoDateTime().describe("활성화 시간"),
  expiresAt: isoDateTime().describe("만료 시간"),
  closedAt: isoDateTime().nullable().describe("종료 시간"),
  paidAmount: z.number().describe("결제 금액"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
}) satisfies z.ZodType<TableSession, z.ZodTypeDef, unknown>;

/** 주문 보드용 세션 응답 (full 주문 포함). */
export const boardTableSessionSchema = z.object({
  publicId: z.string().describe("세션 고유 ID"),
  expiresAt: isoDateTime().describe("세션 만료 시간"),
  orders: z.array(publicOrderWithItemsSchema).describe("주문 목록"),
}) satisfies z.ZodType<BoardSessionWithOrdersResponse, z.ZodTypeDef, unknown>;
