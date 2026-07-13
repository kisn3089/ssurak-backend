import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeModule } from "src/realtime/realtime.module";
import { CartController } from "./carts.controller";
import { CartOwnerController } from "./carts-owner.controller";
import { CartService } from "./carts.service";

@Module({
  imports: [PassportModule, JwtModule, RealtimeModule],
  controllers: [CartController, CartOwnerController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
