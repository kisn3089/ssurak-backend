import {
  PublicOrderWithItem,
  PublicSession,
  PublicTable,
} from "./publicModel.type";

type BoardSessionWithOrders<Option extends "Narrow" | "Wide" = "Narrow"> = Pick<
  PublicSession,
  "publicId" | "expiresAt"
> & {
  orders: PublicOrderWithItem<Option>[];
};

/**
 * GET /orders/v1/tables/{tableId}/active-session 응답.
 * 활성 세션(주문 포함) 또는 활성 세션 없음(null).
 */
export type ActiveSessionResponse<Option extends "Narrow" | "Wide" = "Narrow"> =
  BoardSessionWithOrders<Option> | null;

type BoardTableWithSession<Option extends "Narrow" | "Wide" = "Narrow"> =
  PublicTable & {
    tableSessions?: BoardSessionWithOrders<Option>[];
  };

export type OrderBoardByStore<Option extends "Narrow" | "Wide" = "Narrow"> =
  BoardTableWithSession<Option>[];
