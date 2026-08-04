import z from "zod";
import type { Table } from "../../types/table/table.interface";
import type { BoardTableWithSessionResponse } from "../../types/board/board.interface";
import type { CategoryWithMenusResponse } from "../../types/category/category.interface";
import type { StoreContextResponse } from "../../types/store/store.interface";
import { isoDateTime } from "./common.response";
import { publicStoreSchema } from "./store.response";
import { publicMenuWithOptionsSchema } from "./menu.response";
import { publicOrderWithItemsSchema } from "./order.response";
import {
  boardTableSessionSchema,
  publicTableSessionSchema,
} from "./tableSession.response";

/** 테이블 응답. `id`·`storeId`는 스키마에 없으므로 parse 시 제거된다. */
export const publicTableSchema = z.object({
  publicId: z.string().describe("테이블 고유 ID"),
  tableNumber: z.string().describe("테이블 번호"),
  seats: z.number().nullable().describe("좌석 수"),
  floor: z.number().nullable().describe("층"),
  section: z.string().nullable().describe("구역"),
  isActive: z.boolean().describe("활성화 여부"),
  qrCode: z.string().describe("QR 코드"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
}) satisfies z.ZodType<Table, z.ZodTypeDef, unknown>;

/** 테이블 + 선택적 관계(매장·주문·세션) 응답. */
export const publicTableWithRelationsSchema = publicTableSchema.extend({
  store: publicStoreSchema.optional().describe("매장 정보"),
  orders: z.array(publicOrderWithItemsSchema).optional().describe("주문 목록"),
  tableSessions: z
    .array(publicTableSessionSchema)
    .optional()
    .describe("테이블 세션 목록"),
});

/**
 * 점주 세션 목록·상세 응답. 세션에 테이블과 주문(항목 포함)을 실어 내려준다.
 * `GET /stores/{storeId}/sessions`, `GET /stores/{storeId}/sessions/{sessionId}`.
 */
export const publicSessionWithTableSchema = publicTableSessionSchema.extend({
  table: publicTableSchema.describe("테이블 정보"),
  orders: z.array(publicOrderWithItemsSchema).describe("주문 목록"),
});

/** 보드의 테이블 한 칸 (full 주문 세션 포함). */
export const boardTableSchema = publicTableSchema.extend({
  tableSessions: z
    .array(boardTableSessionSchema)
    .optional()
    .describe("테이블 세션 목록"),
}) satisfies z.ZodType<BoardTableWithSessionResponse, z.ZodTypeDef, unknown>;

/** 카테고리 + 판매 중인 메뉴 목록. 메뉴판 조회에서 사용한다. */
export const categoryWithMenusSchema = z.object({
  id: z.bigint().describe("카테고리 ID (메뉴의 categoryId와 매칭용)"),
  publicId: z.string().describe("카테고리 고유 ID"),
  name: z.string().describe("카테고리 이름"),
  sortOrder: z.number().describe("카테고리 표시 순서"),
  menus: z.array(publicMenuWithOptionsSchema).describe("메뉴 목록"),
}) satisfies z.ZodType<CategoryWithMenusResponse, z.ZodTypeDef, unknown>;

/**
 * 고객 메뉴판 진입 시 내려오는 매장 컨텍스트.
 * 세션 엔티티에서 `table`만 노출하고 세션 필드는 모두 parse 시 제거된다.
 */
export const tableWithStoreContextSchema = z.object({
  table: publicTableSchema
    .extend({
      store: publicStoreSchema
        .extend({
          categories: z
            .array(categoryWithMenusSchema)
            .describe("카테고리 목록"),
        })
        .describe("매장 정보"),
    })
    .describe("테이블 정보"),
}) satisfies z.ZodType<StoreContextResponse, z.ZodTypeDef, unknown>;
