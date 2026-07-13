import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { OrderItemController } from "./order-item/orderItem.controller";
import { OrderItemService } from "./order-item/orderItem.service";
import { OrdersController } from "./orders/orders.controller";
import { OrdersService } from "./orders/orders.service";
import { CustomerOrdersController } from "./orders/customer-orders.controller";
import { RealtimeModule } from "src/realtime/realtime.module";
import { CartModule } from "src/carts/carts.module";

@Module({
  imports: [PassportModule, JwtModule, RealtimeModule, CartModule],
  controllers: [
    OrderItemController,
    OrdersController,
    CustomerOrdersController,
  ],
  providers: [OrderItemService, OrdersService],
})
export class OrderModule {}
