import type { OrderWithItemsResponse } from "../order/order.interface";
import type { Table } from "../table/table.interface";
import type { TableSession } from "../tableSession/tableSession.interface";

/**
 * 주문 보드용 세션. 서버가 세션에서 `publicId`·`expiresAt`만 select해 내려준다.
 */
export type BoardSessionWithOrdersResponse = Pick<
  TableSession,
  "publicId" | "expiresAt"
> & {
  orders: OrderWithItemsResponse[];
};

/**
 * `GET /orders/v1/tables/{tableId}/active-session` 응답.
 * 활성 세션(주문 포함), 또는 활성 세션이 없으면 null.
 */
export type ActiveSessionResponse = BoardSessionWithOrdersResponse | null;

/** 보드의 테이블 한 칸. 활성 세션이 없는 테이블은 `tableSessions`가 비어 있다. */
export type BoardTableWithSessionResponse = Table & {
  tableSessions?: BoardSessionWithOrdersResponse[];
};

/** `GET /orders/v1/stores/{storeId}/board` 응답. 매장의 전체 테이블 보드. */
export type OrderBoardByStoreResponse = BoardTableWithSessionResponse[];
