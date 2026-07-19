import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  ActiveSessionResponse,
  OrderBoardByStore,
  OrderStatus,
  Owner,
  Prisma,
  PublicOrderWithItem,
  SessionWithTable,
  TableSessionStatus,
} from "@ssurak/db";
import type Redlock from "redlock";
import type { Lock } from "redlock";
import { SessionClient } from "src/internal/clients/session.client";
import { PrismaService } from "src/prisma/prisma.service";
import { CartService } from "src/carts/carts.service";
import { REDLOCK_CLIENT } from "src/redis/redis.provider";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { orderSituationPayload } from "src/common/query/order-query.const";
import { ORDER_ITEMS_WITH_OMIT_PRIVATE } from "src/common/query/order-item-query.const";
import {
  CreateCustomerOrderPayloadDto,
  CreateOrderPayloadDto,
  UpdateOrderPayloadDto,
} from "src/dto/request/order.dto";
import {
  ValidatableOrderItem,
  createOrderItemsWithValidMenu,
} from "src/common/validate/order/create-order-item";
import {
  aliveSessionFilter,
  ORDER_WITH_ITEMS_RECORD,
} from "src/common/query/session-query.const";
import { validateOrderSessionToWrite } from "src/common/validate/order/order-session-to-write";
import {
  buildOrderStatusTimestamps,
  validateOrderStatusTransition,
} from "src/common/validate/order/status-transition";
import { MENU_VALIDATION_FIELDS_SELECT } from "src/common/query/menu-query.const";
import { TABLE_OMIT } from "src/common/query/table-query.const";
import {
  CancelParams,
  CreatedOrder,
  CreateOrderParams,
  CreateOrderPayload,
  ReturnOrder,
  UpdatedOrder,
} from "./orders.service.type";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionClient: SessionClient,
    private readonly cartService: CartService,
    @Inject(REDLOCK_CLIENT) private readonly redlock: Redlock
  ) {}

  async createOrderByOwner(
    params: CreateOrderParams,
    createOrderPayload: CreateOrderPayloadDto
  ): Promise<ReturnOrder<CreatedOrder, "tableNumber">> {
    return await this.createOrderCore(params, {
      orderItems: createOrderPayload.orderItems,
      memo: createOrderPayload.memo,
    });
  }

  async createOrderByCustomer(
    session: SessionWithTable,
    createOrderPayload: CreateCustomerOrderPayloadDto
  ): Promise<ReturnOrder<CreatedOrder, "tableNumber" | "deduplicated">> {
    const cart = await this.cartService.getCart(session.sessionToken);

    if (cart.menus.length === 0) {
      throw new HttpException(
        exceptionContentsIs("CART_IS_EMPTY"),
        HttpStatus.BAD_REQUEST
      );
    }

    const orderItems: ValidatableOrderItem[] = cart.menus.map((item) => ({
      menuPublicId: item.menuPublicId,
      quantity: item.quantity,
      requiredOptions: item.requiredOptions,
      customOptions: item.customOptions,
    }));

    const idempotencyKey = `${session.id}:${cart.updatedAt}`;

    const createdOrder = await this.withIdempotencyLock(
      session.sessionToken,
      async () => {
        const existing = await this.findOrderByIdempotencyKey(
          idempotencyKey,
          session.id
        );
        if (existing) return existing;

        return await this.createOrderCore(
          { id: session.id },
          {
            orderItems,
            memo: createOrderPayload.memo,
            idempotencyKey,
            tableSessionId: session.id,
          }
        );
      }
    );

    // 주문된 항목만 차감 — 주문 처리 중 다른 기기에서 담은 항목은 보존한다.
    // 세션 활성화로 expiresAt이 갱신됐을 수 있으므로 생성 결과의 최신 만료시간을
    // 쓰고, 중복 요청의 이중 차감은 idempotencyKey 기록으로 막는다
    await this.cartService.removeOrderedItems(
      { ...session, expiresAt: createdOrder.order.tableSession.expiresAt },
      cart.menus,
      idempotencyKey
    );

    return createdOrder;
  }

  /** 메뉴 검증 → 세션 활성화 → 주문 생성을 한 트랜잭션으로 처리한다. */
  private async createOrderCore(
    params: CreateOrderParams,
    payload: CreateOrderPayload
  ): Promise<ReturnOrder<CreatedOrder, "tableNumber" | "deduplicated">> {
    try {
      const { order, session } = await this.prismaService.$transaction(
        async (tx) => {
          const session: SessionWithTable =
            await this.sessionClient.txGetOrCreateSession(tx, params);

          const menuPublicIds = payload.orderItems.map(
            (item) => item.menuPublicId
          );

          const menus = await tx.menu.findMany({
            where: {
              publicId: { in: menuPublicIds },
              deletedAt: null,
              category: { storeId: session.table.storeId },
            },
            select: MENU_VALIDATION_FIELDS_SELECT,
          });

          const orderItemsData = createOrderItemsWithValidMenu(
            payload.orderItems,
            menus,
            menuPublicIds
          );

          if (session.status !== TableSessionStatus.ACTIVE) {
            await this.sessionClient.updateSessionStatus(
              tx,
              session,
              TableSessionStatus.ACTIVE
            );
          }

          const order = await tx.order.create({
            data: {
              storeId: session.table.storeId,
              tableId: session.table.id,
              tableSessionId: session.id,
              orderItems: { create: orderItemsData },
              memo: payload.memo,
              idempotencyKey: payload.idempotencyKey,
            },
            include: {
              ...ORDER_ITEMS_WITH_OMIT_PRIVATE.include,
              tableSession: { select: { sessionToken: true, expiresAt: true } },
            },
            omit: ORDER_ITEMS_WITH_OMIT_PRIVATE.omit,
          });

          return { order, session };
        }
      );

      return {
        order,
        subscriber: {
          storePublicId: session.table.store.publicId,
          tablePublicId: session.table.publicId,
        },
        meta: { tableNumber: session.table.tableNumber, deduplicated: false },
      };
    } catch (error) {
      if (
        payload.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        this.isIdempotencyKeyConflict(error)
      ) {
        const existing = await this.findOrderByIdempotencyKey(
          payload.idempotencyKey,
          payload.tableSessionId
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async findOrderByIdempotencyKey(
    idempotencyKey: string,
    tableSessionId?: bigint
  ): Promise<ReturnOrder<CreatedOrder, "tableNumber" | "deduplicated"> | null> {
    const order = await this.prismaService.order.findFirst({
      where: { idempotencyKey, ...(tableSessionId ? { tableSessionId } : {}) },
      include: {
        ...ORDER_ITEMS_WITH_OMIT_PRIVATE.include,
        tableSession: { select: { sessionToken: true, expiresAt: true } },
        table: {
          select: {
            publicId: true,
            tableNumber: true,
            store: { select: { publicId: true } },
          },
        },
      },
      omit: ORDER_ITEMS_WITH_OMIT_PRIVATE.omit,
    });

    if (!order) return null;

    return {
      order,
      subscriber: {
        storePublicId: order.table.store.publicId,
        tablePublicId: order.table.publicId,
      },
      meta: { tableNumber: order.table.tableNumber, deduplicated: true },
    };
  }

  private isIdempotencyKeyConflict(
    error: Prisma.PrismaClientKnownRequestError
  ): boolean {
    const target = error.meta?.target;
    const targetText = Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : "";
    return targetText.includes("idempotency");
  }

  private async withIdempotencyLock<T>(
    lockKey: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // best-effort 락. 정확성은 idempotencyKey @unique(P2002 backstop)가 보장하므로,
    // 락 획득에 실패해도 fn()을 그대로 실행한다(중복은 DB unique에서 1건으로 수렴).
    // 단, 락 비활성은 Redis 장애 신호일 수 있어 관찰을 위해 로깅으로 대응
    const lock: Lock | null = await this.redlock
      .acquire([`idem:lock:${lockKey}`], 5000)
      .catch(() => null);

    try {
      return await fn();
    } finally {
      await lock?.release().catch(() => null);
    }
  }

  async getOrderBoard(
    client: Owner,
    storeId: string
  ): Promise<OrderBoardByStore<"Wide">> {
    return await this.prismaService.table.findMany({
      where: { store: { ownerId: client.id, publicId: storeId } },
      include: orderSituationPayload(),
      omit: TABLE_OMIT,
      orderBy: { createdAt: "asc" },
    });
  }

  async getActiveSessionWithOrders(
    tableId: string
  ): Promise<ActiveSessionResponse<"Wide">> {
    const aliveFilter = aliveSessionFilter();
    return await this.prismaService.tableSession.findFirst({
      ...aliveFilter,
      where: { ...aliveFilter.where, table: { publicId: tableId } },
      select: {
        publicId: true,
        expiresAt: true,
        orders: ORDER_WITH_ITEMS_RECORD,
      },
    });
  }

  async getOrdersByStore(
    storeId: string,
    ownerId: bigint
  ): Promise<PublicOrderWithItem<"Wide">[]> {
    return await this.prismaService.order.findMany({
      where: { store: { publicId: storeId, ownerId } },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }

  async getOrdersByTable(
    tableId: string,
    ownerId: bigint
  ): Promise<PublicOrderWithItem<"Wide">[]> {
    return await this.prismaService.order.findMany({
      where: { table: { publicId: tableId, store: { ownerId } } },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }

  async getOrdersBySession(
    tableSessionId: bigint
  ): Promise<PublicOrderWithItem<"Wide">[]> {
    return await this.prismaService.order.findMany({
      where: { tableSessionId },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }

  async getOrderForOwner(
    orderId: string,
    ownerId: bigint
  ): Promise<PublicOrderWithItem<"Wide">> {
    return await this.prismaService.order.findFirstOrThrow({
      where: { publicId: orderId, store: { ownerId } },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }

  async getOrderForSession(
    orderId: string,
    tableSessionId: bigint
  ): Promise<PublicOrderWithItem<"Wide">> {
    return await this.prismaService.order.findFirstOrThrow({
      where: { publicId: orderId, tableSessionId },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }

  async partialUpdateOrder(
    orderId: string,
    ownerId: bigint,
    updatePayload: UpdateOrderPayloadDto
  ): Promise<ReturnOrder<UpdatedOrder, "orderStatus">> {
    const { order, subscriber } = await this.updateOrderWithValidation(
      { kind: "owner", orderId, ownerId },
      updatePayload
    );

    return { order, subscriber, meta: { orderStatus: order.status } };
  }

  async cancelOrder(params: CancelParams): Promise<ReturnOrder<UpdatedOrder>> {
    const { order, subscriber } = await this.updateOrderWithValidation(params, {
      status: OrderStatus.CANCELLED,
    });

    return { order, subscriber };
  }

  private async updateOrderWithValidation(
    params: CancelParams,
    data: Prisma.OrderUpdateInput
  ): Promise<ReturnOrder<UpdatedOrder>> {
    const whereClause: Prisma.OrderWhereInput =
      params.kind === "customer"
        ? { publicId: params.orderId, tableSessionId: params.tableSession.id }
        : {
            publicId: params.orderId,
            store: { ownerId: params.ownerId },
          };

    // 검증~update 사이 동시 요청이 상태를 바꾸면 검증이 스테일해진다.
    // update에 읽은 status를 조건으로 걸어 경합을 감지(P2025)하고, 최신 상태로
    // 1회 재검증해 성공시키거나 도메인 에러를 던진다
    for (let attempt = 0; ; attempt++) {
      const order = await this.prismaService.order.findFirst({
        where: whereClause,
        include: {
          tableSession: true,
          store: { select: { publicId: true } },
          table: { select: { publicId: true, tableNumber: true } },
        },
      });

      const validOrder = validateOrderSessionToWrite(order);

      let updateData = data;

      const nextStatus =
        typeof data.status === "string" ? data.status : undefined;

      if (nextStatus) {
        validateOrderStatusTransition(validOrder.status, nextStatus);
        updateData = {
          ...data,
          ...buildOrderStatusTimestamps(validOrder, nextStatus),
        };
      }

      try {
        const updated = await this.prismaService.order.update({
          where: { id: validOrder.id, status: validOrder.status },
          data: updateData,
          ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
        });

        return {
          order: updated,
          subscriber: {
            storePublicId: validOrder.store.publicId,
            tablePublicId: validOrder.table.publicId,
          },
        };
      } catch (error) {
        const isStaleStatus =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025";
        if (!isStaleStatus || attempt >= 1) throw error;
      }
    }
  }
}
