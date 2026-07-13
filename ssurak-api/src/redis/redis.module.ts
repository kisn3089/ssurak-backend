import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import Redlock from "redlock";

export const REDIS_CLIENT = "REDIS_SSURAK";
export const REDIS_PUB_CLIENT = "REDIS_PUB_CLIENT";
export const REDIS_SUB_CLIENT = "REDIS_SUB_CLIENT";
export const REDLOCK_CLIENT = "REDLOCK_CLIENT";

const createRedis = (config: ConfigService) =>
  new Redis({
    host: config.get<string>("REDIS_HOST", "localhost"),
    port: config.get<number>("REDIS_PORT", 6379),
    password: config.get<string>("REDIS_PASSWORD"),
    maxRetriesPerRequest: null,
  });

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => createRedis(config),
      inject: [ConfigService],
    },
    {
      provide: REDIS_PUB_CLIENT,
      useFactory: (root: Redis) => root.duplicate(),
      inject: [REDIS_CLIENT],
    },
    {
      provide: REDIS_SUB_CLIENT,
      useFactory: (root: Redis) => root.duplicate(),
      inject: [REDIS_CLIENT],
    },
    {
      provide: REDLOCK_CLIENT,
      useFactory: (root: Redis) =>
        new Redlock([root], { retryCount: 3, retryDelay: 200 }),
      inject: [REDIS_CLIENT],
    },
  ],
  exports: [REDIS_CLIENT, REDIS_PUB_CLIENT, REDIS_SUB_CLIENT, REDLOCK_CLIENT],
})
export class RedisModule {}
