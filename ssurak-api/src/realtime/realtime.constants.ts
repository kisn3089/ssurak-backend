import { ConfigService } from "@nestjs/config";

export type MetaInfo<
  Source = unknown,
  Keys extends keyof Source = keyof Source,
> = [Keys] extends [never] ? { meta?: never } : { meta: Pick<Source, Keys> };

export const REALTIME_NAMESPACE = "/events";
export const REALTIME_PATH = "/ws/";

export type OriginKind = "admin" | "customer";

export const PRIVATE_HOST_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?$/;

const isDev = (config: ConfigService): boolean =>
  config.get("NODE_ENV") !== "production";

const getPort = (url: string): string | null => {
  try {
    return new URL(url).port || null;
  } catch {
    return null;
  }
};

export const getRealtimeOriginKind = (
  config: ConfigService,
  origin: string | undefined
): OriginKind | null => {
  if (!origin) return null;
  const orderUrl = config.getOrThrow<string>("ORDER_APP_URL");
  const consoleUrl = config.getOrThrow<string>("CONSOLE_APP_URL");
  if (origin === orderUrl) return "customer";
  if (origin === consoleUrl) return "admin";

  if (isDev(config) && PRIVATE_HOST_ORIGIN.test(origin)) {
    const port = getPort(origin);
    return port === getPort(consoleUrl) ? "admin" : "customer";
  }
  return null;
};

type CorsOriginFn = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void
) => void;

export const getRealtimeCorsOrigin = (
  config: ConfigService
): string[] | CorsOriginFn => {
  const allowed = [
    config.getOrThrow<string>("ORDER_APP_URL"),
    config.getOrThrow<string>("CONSOLE_APP_URL"),
  ];
  if (!isDev(config)) return allowed;

  return (origin, cb) => {
    if (
      !origin ||
      allowed.includes(origin) ||
      PRIVATE_HOST_ORIGIN.test(origin)
    ) {
      cb(null, true);
    } else {
      cb(new Error("CORS blocked"));
    }
  };
};

export const REALTIME_EVENT = {
  ORDER_CREATED: "order.created",
  ORDER_UPDATED: "order.updated",
  ORDER_CANCELLED: "order.cancelled",
  ORDER_ITEM_UPDATED: "order.item.updated",
  ORDER_ITEM_DELETED: "order.item.deleted",
  SUBSCRIBE_ADMIN: "subscribe:admin",
  UNSUBSCRIBE_ADMIN: "unsubscribe:admin",
  CART_CREATED: "cart.created",
  CART_UPDATED: "cart.updated",
  CART_DELETED: "cart.deleted",
  CART_CLEARED: "cart.cleared",
} as const;

export const realtimeRoom = {
  admins: (storePublicId: string) => `store:${storePublicId}:admins`,
  table: (storePublicId: string, tablePublicId: string) =>
    `store:${storePublicId}:table:${tablePublicId}`,
};
