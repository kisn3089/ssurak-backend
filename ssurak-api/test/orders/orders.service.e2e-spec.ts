import { HttpStatus, INestApplication } from "@nestjs/common";
import { OrderStatus, TableSessionStatus } from "@ssurak/db";
import type Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CartService } from "src/carts/carts.service";
import { OrdersService } from "src/orders/orders/orders.service";
import { PrismaService } from "src/prisma/prisma.service";
import { REDIS_CLIENT } from "src/redis/redis.provider";
import { createTestApp } from "test/helpers/create-test-app";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";
import {
  cleanupStoreDomain,
  createSession,
  seedStoreDomain,
  SeededStoreDomain,
} from "test/helpers/seed-store";

describe("OrdersService (통합)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let ordersService: OrdersService;
  let cartService: CartService;
  let domain: SeededStoreDomain;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
    ordersService = app.get(OrdersService);
    cartService = app.get(CartService);
    domain = await seedStoreDomain(prisma);
  });

  afterAll(async () => {
    const tokens = await prisma.tableSession.findMany({
      where: { table: { storeId: domain.store.id } },
      select: { sessionToken: true },
    });
    const keys = tokens.map((t) => `cart:${t.sessionToken}`);
    if (keys.length) await redis.del(...keys);

    await cleanupStoreDomain(prisma, domain);
    await app.close();
  });

  const fillCart = async (session: Awaited<ReturnType<typeof createSession>>) =>
    await cartService.addItem(session, {
      menuPublicId: domain.menuWithOptions.publicId,
      quantity: 2,
      requiredOptions: { 사이즈: "라지" },
    });

  describe("createOrderByCustomer", () => {
    it("장바구니가 비어 있으면 CART_IS_EMPTY(400)", async () => {
      const session = await createSession(prisma, domain.table);

      await expectHttpExceptionAsync(
        () => ordersService.createOrderByCustomer(session, {}),
        { code: "CART_IS_EMPTY", status: HttpStatus.BAD_REQUEST }
      );
    });

    it("장바구니로 주문을 생성하고, 세션을 ACTIVE로 전환하며, 장바구니를 비운다", async () => {
      const session = await createSession(prisma, domain.table, {
        status: TableSessionStatus.WAITING_ORDER,
      });
      await fillCart(session);

      const { order, meta, subscriber } =
        await ordersService.createOrderByCustomer(session, {
          memo: "덜 맵게 해주세요",
        });

      expect(order.orderItems).toHaveLength(1);
      expect(order.orderItems[0]).toMatchObject({
        menuName: "아메리카노",
        basePrice: 3000,
        optionsPrice: 500,
        unitPrice: 3500,
        quantity: 2,
      });
      expect(order.memo).toBe("덜 맵게 해주세요");
      expect(meta.deduplicated).toBe(false);
      expect(subscriber.storePublicId).toBe(domain.store.publicId);

      const updatedSession = await prisma.tableSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(updatedSession.status).toBe(TableSessionStatus.ACTIVE);

      const cart = await cartService.getCart(session.sessionToken);
      expect(cart.menus).toHaveLength(0);
    });

    it("동시에 두 번 주문해도 주문은 1건으로 수렴한다(멱등성)", async () => {
      const session = await createSession(prisma, domain.table);
      await fillCart(session);

      const [first, second] = await Promise.all([
        ordersService.createOrderByCustomer(session, {}),
        ordersService.createOrderByCustomer(session, {}),
      ]);

      expect(first.order.publicId).toBe(second.order.publicId);
      expect([first.meta.deduplicated, second.meta.deduplicated]).toContain(
        true
      );

      const orderCount = await prisma.order.count({
        where: { tableSessionId: session.id },
      });
      expect(orderCount).toBe(1);
    });
  });

  describe("partialUpdateOrder — 상태 전이", () => {
    const createOrder = async () => {
      const session = await createSession(prisma, domain.table);
      await fillCart(session);
      const { order } = await ordersService.createOrderByCustomer(session, {});
      return order;
    };

    it("PENDING → ACCEPTED 전환 시 acceptedAt이 기록된다", async () => {
      const order = await createOrder();

      const { order: updated } = await ordersService.partialUpdateOrder(
        order.publicId,
        domain.owner.id,
        { status: OrderStatus.ACCEPTED }
      );

      expect(updated.status).toBe(OrderStatus.ACCEPTED);
      expect(updated.acceptedAt).not.toBeNull();
      expect(updated.completedAt).toBeNull();
    });

    it("단계를 건너뛴 PENDING → COMPLETED도 acceptedAt과 completedAt을 모두 기록한다", async () => {
      const order = await createOrder();

      const { order: updated } = await ordersService.partialUpdateOrder(
        order.publicId,
        domain.owner.id,
        { status: OrderStatus.COMPLETED }
      );

      expect(updated.acceptedAt).not.toBeNull();
      expect(updated.completedAt).not.toBeNull();
    });

    it("상태 역행(ACCEPTED → PENDING)은 ORDER_STATUS_INVALID_TRANSITION(400)", async () => {
      const order = await createOrder();
      await ordersService.partialUpdateOrder(order.publicId, domain.owner.id, {
        status: OrderStatus.ACCEPTED,
      });

      await expectHttpExceptionAsync(
        () =>
          ordersService.partialUpdateOrder(order.publicId, domain.owner.id, {
            status: OrderStatus.PENDING,
          }),
        {
          code: "ORDER_STATUS_INVALID_TRANSITION",
          status: HttpStatus.BAD_REQUEST,
          details: { from: OrderStatus.ACCEPTED, to: OrderStatus.PENDING },
        }
      );
    });

    it("같은 상태로의 중복 변경도 거부된다", async () => {
      const order = await createOrder();

      await expectHttpExceptionAsync(
        () =>
          ordersService.partialUpdateOrder(order.publicId, domain.owner.id, {
            status: OrderStatus.PENDING,
          }),
        {
          code: "ORDER_STATUS_INVALID_TRANSITION",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("상태 없이 memo만 변경하는 것은 전이 검증 없이 허용된다", async () => {
      const order = await createOrder();

      const { order: updated } = await ordersService.partialUpdateOrder(
        order.publicId,
        domain.owner.id,
        { memo: "빨리 부탁해요" }
      );

      expect(updated.memo).toBe("빨리 부탁해요");
      expect(updated.status).toBe(OrderStatus.PENDING);
    });
  });

  describe("cancelOrder", () => {
    it("완료 전 주문은 취소되고, 취소된 주문은 다시 변경할 수 없다", async () => {
      const session = await createSession(prisma, domain.table);
      await fillCart(session);
      const { order } = await ordersService.createOrderByCustomer(session, {});

      const { order: cancelled } = await ordersService.cancelOrder({
        kind: "owner",
        orderId: order.publicId,
        ownerId: domain.owner.id,
      });
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);

      await expectHttpExceptionAsync(
        () =>
          ordersService.cancelOrder({
            kind: "owner",
            orderId: order.publicId,
            ownerId: domain.owner.id,
          }),
        { code: "ORDER_ALREADY_CANCELLED", status: HttpStatus.BAD_REQUEST }
      );
    });
  });
});
