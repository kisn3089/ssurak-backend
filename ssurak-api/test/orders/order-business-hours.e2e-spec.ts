import { HttpStatus, INestApplication } from "@nestjs/common";
import { TableSessionStatus } from "@ssurak/db";
import { StoreOpenReason } from "@ssurak/schema";
import type Redis from "ioredis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CartService } from "src/carts/carts.service";
import { getBusinessDate } from "src/common/business-hours";
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
  selectOption,
  setBusinessHours,
} from "test/helpers/seed-store";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe("주문 — 영업시간과 주문번호 (통합)", () => {
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

  afterEach(async () => {
    // 매 테스트가 영업시간·휴무일을 자기 시나리오로 바꾸므로 원상복구한다.
    await setBusinessHours(prisma, domain.store, []);
    await prisma.storeClosure.deleteMany({
      where: { storeId: domain.store.id },
    });
    await prisma.store.update({
      where: { id: domain.store.id },
      data: { isOpen: true },
    });
  });

  afterAll(async () => {
    const tokens = await prisma.tableSession.findMany({
      where: { table: { storeId: domain.store.id } },
      select: { sessionToken: true },
    });
    const keys = tokens.map(({ sessionToken }) => `cart:${sessionToken}`);
    if (keys.length) await redis.del(...keys);

    await cleanupStoreDomain(prisma, domain);
    await app.close();
  });

  /** 장바구니를 채운 새 세션. 주문 1건마다 세션을 새로 만들어 멱등키가 겹치지 않게 한다. */
  const sessionWithCart = async () => {
    const session = await createSession(prisma, domain.table, {
      status: TableSessionStatus.ACTIVE,
    });

    await cartService.addItem(session, {
      menuPublicId: domain.menuWithOptions.publicId,
      quantity: 1,
      options: [selectOption(domain.menuWithOptions, "사이즈", "라지")],
    });

    return session;
  };

  const closeEveryDay = async () =>
    await setBusinessHours(
      prisma,
      domain.store,
      ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek, isClosed: true }))
    );

  const todayBusinessDate = async (): Promise<string> => {
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: domain.store.id },
      select: { timezone: true, businessDayCutoff: true },
    });

    return getBusinessDate(new Date(), store);
  };

  describe("영업시간 밖 주문 거절", () => {
    it("정기 휴무 요일이면 고객 주문을 STORE_CLOSED(409)로 거절한다", async () => {
      await closeEveryDay();
      const session = await sessionWithCart();

      await expectHttpExceptionAsync(
        () => ordersService.createOrderByCustomer(session, {}),
        { code: "STORE_CLOSED", status: HttpStatus.CONFLICT }
      );
    });

    it("임시 휴무일이면 정기 영업시간이 열려 있어도 거절한다", async () => {
      await setBusinessHours(
        prisma,
        domain.store,
        ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek }))
      );
      await prisma.storeClosure.create({
        data: {
          storeId: domain.store.id,
          date: await todayBusinessDate(),
          reason: "임시 휴무",
        },
      });

      const session = await sessionWithCart();

      await expectHttpExceptionAsync(
        () => ordersService.createOrderByCustomer(session, {}),
        { code: "STORE_CLOSED", status: HttpStatus.CONFLICT }
      );
    });

    it("점주가 수동으로 닫아도 거절한다", async () => {
      await prisma.store.update({
        where: { id: domain.store.id },
        data: { isOpen: false },
      });
      const session = await sessionWithCart();

      await expectHttpExceptionAsync(
        () => ordersService.createOrderByCustomer(session, {}),
        { code: "STORE_CLOSED", status: HttpStatus.CONFLICT }
      );
    });

    it("점주 대리 주문은 영업시간 밖에도 통과한다", async () => {
      await closeEveryDay();

      const { order } = await ordersService.createOrderByOwner(
        { id: (await createSession(prisma, domain.table)).id },
        {
          orderItems: [
            {
              menuPublicId: domain.simpleMenu.publicId,
              quantity: 1,
              options: [],
            },
          ],
        }
      );

      expect(order.orderNumber).toMatch(/^A-\d{4}$/);
    });

    it("영업시간을 설정하지 않은 매장은 언제든 주문을 받는다", async () => {
      const session = await sessionWithCart();

      const { order } = await ordersService.createOrderByCustomer(session, {});

      expect(order.orderItems).toHaveLength(1);
    });
  });

  describe("주문번호 채번", () => {
    it("같은 영업일 안에서는 1씩 증가한다", async () => {
      const first = await ordersService.createOrderByCustomer(
        await sessionWithCart(),
        {}
      );
      const second = await ordersService.createOrderByCustomer(
        await sessionWithCart(),
        {}
      );

      expect(second.order.orderSeq).toBe(first.order.orderSeq + 1);
      expect(second.order.businessDate).toBe(first.order.businessDate);
      expect(second.order.orderNumber).toBe(
        `A-${String(second.order.orderSeq).padStart(4, "0")}`
      );
    });

    it("영업일이 바뀌면 A-0001부터 다시 시작한다", async () => {
      const { order: previousDay } = await ordersService.createOrderByCustomer(
        await sessionWithCart(),
        {}
      );

      // 지난 영업일의 주문을 어제로 옮겨, 오늘 영업일에는 주문이 하나도 없는 상태를 만든다.
      await prisma.order.updateMany({
        where: { storeId: domain.store.id },
        data: { businessDate: "2020-01-01" },
      });

      const { order: today } = await ordersService.createOrderByCustomer(
        await sessionWithCart(),
        {}
      );

      expect(previousDay.orderNumber).toBeTruthy();
      expect(today.orderSeq).toBe(1);
      expect(today.orderNumber).toBe("A-0001");
      expect(today.businessDate).toBe(await todayBusinessDate());
    });

    it("접두사는 매장 설정을 따른다", async () => {
      await prisma.store.update({
        where: { id: domain.store.id },
        data: { orderNumberPrefix: "B" },
      });

      try {
        const { order } = await ordersService.createOrderByCustomer(
          await sessionWithCart(),
          {}
        );

        expect(order.orderNumber.startsWith("B-")).toBe(true);
      } finally {
        await prisma.store.update({
          where: { id: domain.store.id },
          data: { orderNumberPrefix: "A" },
        });
      }
    });
  });

  describe("거절 응답", () => {
    it("사유와 다음 영업 시작 시각을 함께 알려준다", async () => {
      await closeEveryDay();
      const session = await sessionWithCart();

      await expect(
        ordersService.createOrderByCustomer(session, {})
      ).rejects.toMatchObject({
        response: {
          code: "STORE_CLOSED",
          details: { reason: StoreOpenReason.CLOSED_DAY, nextOpenAt: null },
        },
      });
    });
  });
});
