import { Injectable, Logger } from "@nestjs/common";
import { OrderSyncEvent } from "@ssurak/db";
import { REALTIME_EVENT, realtimeRoom } from "./realtime.constants";
import { RealtimeGateway } from "./realtime.gateway";

export type OrderSubscriber = {
  storePublicId: string;
  tablePublicId: string;
};

type EmitOrder = {
  subscriber: OrderSubscriber;
  payload: Omit<OrderSyncEvent, "tablePublicId">;
  excludeSocketId?: string;
};

@Injectable()
export class OrderEventsService {
  private readonly logger = new Logger(OrderEventsService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  emitOrderCreated(emitOrder: EmitOrder): void {
    this.broadcast(REALTIME_EVENT.ORDER_CREATED, emitOrder);
  }

  emitOrderUpdated(emitOrder: EmitOrder): void {
    this.broadcast(REALTIME_EVENT.ORDER_UPDATED, emitOrder);
  }

  emitOrderCancelled(emitOrder: EmitOrder): void {
    this.broadcast(REALTIME_EVENT.ORDER_CANCELLED, emitOrder);
  }

  /** OrderItem Events */
  emitOrderItemUpdated(emitOrder: EmitOrder): void {
    this.broadcast(REALTIME_EVENT.ORDER_ITEM_UPDATED, emitOrder);
  }

  emitOrderItemRemoved(emitOrder: EmitOrder): void {
    this.broadcast(REALTIME_EVENT.ORDER_ITEM_DELETED, emitOrder);
  }

  private broadcast(
    event: string,
    { payload, subscriber, excludeSocketId }: EmitOrder
  ): void {
    const { storePublicId, tablePublicId } = subscriber;
    const { server } = this.gateway;
    const adminsRoom = realtimeRoom.admins(storePublicId);
    const tableRoom = realtimeRoom.table(storePublicId, tablePublicId);
    const scope = excludeSocketId
      ? server.to([adminsRoom, tableRoom]).except(excludeSocketId)
      : server.to([adminsRoom, tableRoom]);
    scope.emit(event, { ...payload, tablePublicId });
    this.logger.log(
      `emit ${event} → ${adminsRoom}, ${tableRoom}${excludeSocketId ? ` (except ${excludeSocketId})` : ""}`
    );
  }
}
