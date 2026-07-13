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
