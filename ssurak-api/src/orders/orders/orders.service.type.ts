import { OrderStatus, PublicOrderWithItem, TableSession } from "@ssurak/db";
import { ValidatableOrderItem } from "src/common/validate/order/create-order-item";
import { SessionIdentifier } from "src/internal/services/session-core.service";
import { OrderSubscriber } from "src/realtime/order-events.service";
import { MetaInfo } from "src/realtime/realtime.constants";

export type CreateOrderParams = SessionIdentifier;
export type CancelParams =
  | { kind: "owner"; orderId: string; ownerId: bigint }
  | { kind: "customer"; orderId: string; tableSession: TableSession };

export type CreatedOrder = PublicOrderWithItem<
  "Wide",
  { sessionToken: string; expiresAt: Date }
>;
export type UpdatedOrder = PublicOrderWithItem<"Wide">;
/**
 * 영업시간 강제 여부. 고객 주문만 켠다 —
 * 점주 대리 주문은 마감 후에도 넣을 수 있어야 한다.
 */
export type CreateOrderOptions = { enforceBusinessHours: boolean };

export type CreateOrderPayload = {
  orderItems: ValidatableOrderItem[];
  memo?: string;
  idempotencyKey?: string;
  tableSessionId?: bigint;
};

export type ReturnOrder<
  Order extends CreatedOrder | UpdatedOrder,
  MetaKeys extends keyof MetaInfoList = never,
> = {
  order: Order;
  subscriber: OrderSubscriber;
} & MetaInfo<MetaInfoList, MetaKeys>;

export type MetaInfoList = {
  tableNumber: string;
  deduplicated: boolean;
  orderStatus: OrderStatus;
};
