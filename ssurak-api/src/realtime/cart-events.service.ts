import { Injectable, Logger } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";
import { REALTIME_EVENT, realtimeRoom } from "./realtime.constants";
import { CartSyncEvent } from "@ssurak/db";

export type CartSubscriber = {
  storePublicId: string;
  tablePublicId: string;
};

type EmitCart = {
  subscriber: CartSubscriber;
  payload: CartSyncEvent;
  excludeSocketId?: string;
};

@Injectable()
export class CartEventsService {
  private readonly logger = new Logger(CartEventsService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  emitCartAdd(emitCart: EmitCart): void {
    this.broadcast(REALTIME_EVENT.CART_CREATED, emitCart);
  }

  emitCartUpdated(emitCart: EmitCart): void {
    this.broadcast(REALTIME_EVENT.CART_UPDATED, emitCart);
  }

  emitCartDeleted(emitCart: EmitCart): void {
    this.broadcast(REALTIME_EVENT.CART_DELETED, emitCart);
  }

  emitCartCleared(emitCart: EmitCart): void {
    this.broadcast(REALTIME_EVENT.CART_CLEARED, emitCart);
  }

  private broadcast(
    event: string,
    { payload, subscriber, excludeSocketId }: EmitCart
  ): void {
    const { server } = this.gateway;
    const tableRoom = realtimeRoom.table(
      subscriber.storePublicId,
      subscriber.tablePublicId
    );
    const scope = excludeSocketId
      ? server.to(tableRoom).except(excludeSocketId)
      : server.to(tableRoom);
    scope.emit(event, payload);
    this.logger.log(
      `emit ${event} → ${tableRoom}${excludeSocketId ? ` (except ${excludeSocketId})` : ""}`
    );
  }
}
