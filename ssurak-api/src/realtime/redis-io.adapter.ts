import { IoAdapter } from "@nestjs/platform-socket.io";
import { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Server, ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import { REDIS_PUB_CLIENT, REDIS_SUB_CLIENT } from "../redis/redis.module";
import { getRealtimeCorsOrigin } from "./realtime.constants";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(): void {
    const pub = this.app.get<Redis>(REDIS_PUB_CLIENT);
    const sub = this.app.get<Redis>(REDIS_SUB_CLIENT);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const config = this.app.get(ConfigService);
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: getRealtimeCorsOrigin(config),
        credentials: true,
      },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
