import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { DefaultEventsMap, Namespace, Socket } from "socket.io";
import { isAdmin } from "src/utils/isAdmin";
import {
  getRealtimeOriginKind,
  REALTIME_EVENT,
  REALTIME_NAMESPACE,
  REALTIME_PATH,
  realtimeRoom,
} from "./realtime.constants";
import { parseCookies, RealtimePrincipal, WsAuthService } from "./ws-auth";

type SocketData = { principal: RealtimePrincipal };
type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

type AppNamespace = Namespace<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  path: REALTIME_PATH,
})
export class RealtimeGateway
  implements OnGatewayInit<AppNamespace>, OnGatewayConnection
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: AppNamespace;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly config: ConfigService
  ) {}

  afterInit(namespace: AppNamespace): void {
    namespace.use((socket, next) => {
      void this.authenticate(socket).then(
        (principal) => {
          if (principal) {
            socket.data.principal = principal;
            next();
          } else {
            this.logger.warn(
              `ws auth rejected, ip=${socket.handshake.address}`
            );
            next(new Error("unauthorized"));
          }
        },
        (err: unknown) => next(err as Error)
      );
    });
  }

  private async authenticate(
    socket: AppSocket
  ): Promise<RealtimePrincipal | null> {
    const origin = socket.handshake.headers.origin;
    const kind = getRealtimeOriginKind(this.config, origin);
    if (!kind) {
      this.logger.warn(`ws auth: unrecognized origin=${origin ?? "(none)"}`);
      return null;
    }

    const cookies = parseCookies(socket.handshake.headers.cookie);
    return kind === "admin"
      ? this.wsAuth.verifyAdmin(cookies)
      : this.wsAuth.verifyCustomer(cookies);
  }

  async handleConnection(client: AppSocket): Promise<void> {
    const principal = client.data.principal;

    if (principal.kind === "customer") {
      const room = realtimeRoom.table(
        principal.storePublicId,
        principal.tablePublicId
      );
      await client.join(room);
      this.logger.log(`ws connect ${client.id} as customer room=${room}`);
      return;
    }

    this.logger.log(`ws connect ${client.id} as admin role=${principal.role}`);
  }

  @SubscribeMessage(REALTIME_EVENT.SUBSCRIBE_ADMIN)
  async subscribeAdmin(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() body: { storeId?: string }
  ): Promise<{ ok: boolean }> {
    const principal = client.data.principal;
    if (!principal || principal.kind !== "admin") {
      this.logger.warn(
        `subscribe:admin from ${client.id} rejected: not admin (principal=${principal?.kind})`
      );
      return { ok: false };
    }

    const storeId = body?.storeId;
    if (!storeId) {
      this.logger.warn(`subscribe:admin from ${client.id} missing storeId`);
      return { ok: false };
    }

    const allowed =
      isAdmin(principal.role) ||
      (await this.wsAuth.ownsStore(principal.userId, storeId));
    if (!allowed) {
      this.logger.warn(
        `subscribe:admin from ${client.id} not allowed for store=${storeId}`
      );
      return { ok: false };
    }

    const room = realtimeRoom.admins(storeId);
    await client.join(room);
    this.logger.log(`${client.id} joined room=${room}`);
    return { ok: true };
  }

  @SubscribeMessage(REALTIME_EVENT.UNSUBSCRIBE_ADMIN)
  async unsubscribeAdmin(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() body: { storeId?: string }
  ): Promise<{ ok: boolean }> {
    if (!body?.storeId) return { ok: false };
    await client.leave(realtimeRoom.admins(body.storeId));
    return { ok: true };
  }
}
