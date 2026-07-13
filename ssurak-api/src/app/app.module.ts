import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { StoreModule } from "../stores/stores.module";
import { OrderModule } from "../orders/orders.module";
import { CartModule } from "../carts/carts.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { APP_FILTER, RouterModule } from "@nestjs/core";
import { GlobalExceptionFilter } from "src/common/filters/exception.filter";
import { AuthModule } from "src/auth/auth.module";
import { IdentityModule } from "src/identity/identity.module";
import { InternalModule } from "src/internal/internal.module";
import { RedisModule } from "src/redis/redis.module";
import { RealtimeModule } from "src/realtime/realtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../.env"],
    }),
    PrismaModule,
    RedisModule,
    InternalModule,
    AuthModule,
    IdentityModule,
    StoreModule,
    OrderModule,
    CartModule,
    RealtimeModule,

    RouterModule.register([
      { path: "auth/v1", module: AuthModule },
      { path: "identity/v1", module: IdentityModule },
      { path: "stores/v1", module: StoreModule },
      { path: "orders/v1", module: OrderModule },
      { path: "carts/v1", module: CartModule },
    ]),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    AppService,
  ],
})
export class AppModule {}
