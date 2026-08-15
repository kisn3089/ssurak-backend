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
import { StorageModule } from "src/storage/storage.module";
import { S3Module } from "src/storage/s3.module";
import { MenuImageModule } from "src/common/image/menu-image.module";
import { envSchemas } from "@ssurak/schema";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../.env"],
      validate: (config) => envSchemas.parse(config),
    }),
    PrismaModule,
    RedisModule,
    S3Module,
    MenuImageModule,
    InternalModule,
    AuthModule,
    IdentityModule,
    StoreModule,
    OrderModule,
    CartModule,
    RealtimeModule,
    StorageModule,

    RouterModule.register([
      { path: "auth/v1", module: AuthModule },
      { path: "identity/v1", module: IdentityModule },
      { path: "stores/v1", module: StoreModule },
      { path: "orders/v1", module: OrderModule },
      { path: "carts/v1", module: CartModule },
      { path: "upload/v1", module: StorageModule },
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
