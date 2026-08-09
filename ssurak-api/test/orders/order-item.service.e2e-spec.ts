import { HttpStatus, INestApplication } from "@nestjs/common";
import { Order, OrderStatus, TableSessionStatus } from "@ssurak/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OrderItemService } from "src/orders/order-item/orderItem.service";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";
import {
  cleanupStoreDomain,
  createSession,
  seedStoreDomain,
  SeededStoreDomain,
  selectOption,
} from "test/helpers/seed-store";

describe("OrderItemService (통합)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orderItemService: OrderItemService;
  let domain: SeededStoreDomain;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    orderItemService = app.get(OrderItemService);
    domain = await seedStoreDomain(prisma);
  });

  afterAll(async () => {
    await cleanupStoreDomain(prisma, domain);
    await app.close();
  });

  /** 아메리카노(라지+샷추가) 1개짜리 주문을 만든다 */
  const createOrderWithItem = async (): Promise<Order> => {
    const session = await createSession(prisma, domain.table, {
      status: TableSessionStatus.ACTIVE,
    });
    return await prisma.order.create({
      data: {
        storeId: domain.store.id,
        tableId: domain.table.id,
        tableSessionId: session.id,
        orderItems: {
          create: [
            {
              menuId: domain.menuWithOptions.id,
              menuName: domain.menuWithOptions.name,
              basePrice: 3000,
              optionsPrice: 1000,
              unitPrice: 4000,
              quantity: 1,
              optionsSnapshot: {
                options: [
                  snapshotOf("사이즈", "라지", 500),
                  snapshotOf("샷", "샷추가", 500),
                ],
              },
            },
          ],
        },
      },
    });
  };

  /** 시드된 메뉴의 실제 publicId로 확정 스냅샷 조각을 만든다. */
  const snapshotOf = (
    groupName: string,
    choiceName: string,
    priceDelta: number
  ) => {
    const group = domain.menuWithOptions.options.find(
      ({ name }) => name === groupName
    )!;
    const choice = group.choices.find(({ name }) => name === choiceName)!;

    return {
      optionId: group.publicId,
      name: group.name,
      choices: [
        {
          choiceId: choice.publicId,
          name: choice.name,
          priceDelta,
          quantity: 1,
        },
      ],
    };
  };

  const groupIdOf = (
    menu: SeededStoreDomain["menuWithOptions"],
    name: string
  ) => menu.options.find((group) => group.name === name)!.publicId;

  const firstItemOf = async (order: Order) =>
    await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

  describe("partialUpdateOrderItem", () => {
    it("일부 옵션 그룹만 보내도 나머지 그룹의 기존 선택이 유지된다 (부분 업데이트)", async () => {
      const order = await createOrderWithItem();
      const item = await firstItemOf(order);

      const { orderItem: updated } =
        await orderItemService.partialUpdateOrderItem(
          item.publicId,
          domain.owner.id,
          { options: [selectOption(domain.menuWithOptions, "샷", "기본")] }
        );

      // 기존 선택(사이즈: 라지)이 유지되고 샷만 기본으로 변경
      expect(updated.optionsSnapshot).toEqual({
        options: [
          snapshotOf("사이즈", "라지", 500),
          snapshotOf("샷", "기본", 0),
        ],
      });
      expect(updated.optionsPrice).toBe(500);
      expect(updated.unitPrice).toBe(3500);
    });

    /**
     * Prisma의 update는 undefined를 "변경 없음"으로 읽는다. 스냅샷을 그대로 넘기면
     * 옵션이 사라진 결과가 저장되지 않고 이전 메뉴의 옵션이 화면에 계속 남는다.
     */
    it("옵션 없는 메뉴로 바꾸면 기존 스냅샷이 지워진다", async () => {
      const order = await createOrderWithItem();
      const item = await firstItemOf(order);

      const { orderItem: updated } =
        await orderItemService.partialUpdateOrderItem(
          item.publicId,
          domain.owner.id,
          { menuPublicId: domain.simpleMenu.publicId }
        );

      expect(updated.optionsSnapshot).toBeNull();
      expect(updated.optionsPrice).toBe(0);
      expect(updated.unitPrice).toBe(1000);
    });

    it("선택을 빈 배열로 보내 그룹을 비우면 스냅샷이 지워진다", async () => {
      const order = await createOrderWithItem();
      const menu = domain.menuWithAdvancedOptions;
      // 필수 그룹이 없는 메뉴여야 옵션을 전부 비울 수 있다.
      const created = await orderItemService.createOrderItem(
        order.publicId,
        domain.owner.id,
        {
          menuPublicId: menu.publicId,
          quantity: 1,
          options: [selectOption(menu, "토핑", "초코칩")],
        }
      );
      expect(created.optionsPrice).toBe(300);

      const { orderItem: updated } =
        await orderItemService.partialUpdateOrderItem(
          created.publicId,
          domain.owner.id,
          { options: [{ optionId: groupIdOf(menu, "토핑"), choices: [] }] }
        );

      expect(updated.optionsSnapshot).toBeNull();
      expect(updated.optionsPrice).toBe(0);
    });

    /**
     * 조건이 되는 그룹을 바꾸는 한 번의 요청으로 끝나야 한다. 저장된 선택까지 400으로
     * 막으면 점주가 조건부 그룹을 먼저 비우는 요청을 따로 보내야 한다.
     */
    it("조건이 깨진 그룹의 저장된 선택은 조용히 빠진다", async () => {
      const order = await createOrderWithItem();
      const menu = domain.menuWithAdvancedOptions;
      const created = await orderItemService.createOrderItem(
        order.publicId,
        domain.owner.id,
        {
          menuPublicId: menu.publicId,
          quantity: 1,
          options: [
            selectOption(menu, "토핑", "그래놀라"),
            selectOption(menu, "소스", "초코 소스"),
          ],
        }
      );
      expect(created.optionsPrice).toBe(200);

      // 그래놀라를 빼면 "소스"의 노출 조건이 깨진다. 소스는 페이로드에 없지만 병합으로 딸려온다.
      const { orderItem: updated } =
        await orderItemService.partialUpdateOrderItem(
          created.publicId,
          domain.owner.id,
          { options: [selectOption(menu, "토핑", "초코칩")] }
        );

      expect(
        updated.optionsSnapshot?.options.map((group) => group.name)
      ).toEqual(["토핑"]);
      expect(updated.optionsPrice).toBe(300);
    });

    it("quantity만 변경하면 옵션 검증 없이 갱신된다", async () => {
      const order = await createOrderWithItem();
      const item = await firstItemOf(order);

      const { orderItem: updated } =
        await orderItemService.partialUpdateOrderItem(
          item.publicId,
          domain.owner.id,
          { quantity: 3 }
        );

      expect(updated.quantity).toBe(3);
      expect(updated.unitPrice).toBe(4000);
    });

    it("종료된 세션의 주문 항목은 SESSION_INACTIVE(400)로 수정이 거부된다", async () => {
      const order = await createOrderWithItem();
      const item = await firstItemOf(order);
      await prisma.tableSession.update({
        where: { id: order.tableSessionId },
        data: { status: TableSessionStatus.CLOSED },
      });

      await expectHttpExceptionAsync(
        () =>
          orderItemService.partialUpdateOrderItem(
            item.publicId,
            domain.owner.id,
            { quantity: 2 }
          ),
        { code: "SESSION_INACTIVE", status: HttpStatus.BAD_REQUEST }
      );
    });
  });

  describe("createOrderItem", () => {
    it("메뉴 스냅샷과 옵션 가격으로 항목을 추가한다", async () => {
      const order = await createOrderWithItem();

      const created = await orderItemService.createOrderItem(
        order.publicId,
        domain.owner.id,
        {
          menuPublicId: domain.simpleMenu.publicId,
          quantity: 2,
        }
      );

      expect(created).toMatchObject({
        menuName: "생수",
        basePrice: 1000,
        unitPrice: 1000,
        quantity: 2,
      });
    });
  });

  describe("deleteOrderItem", () => {
    it("항목이 남아 있으면 주문은 유지된다", async () => {
      const order = await createOrderWithItem();
      const first = await firstItemOf(order);
      await orderItemService.createOrderItem(order.publicId, domain.owner.id, {
        menuPublicId: domain.simpleMenu.publicId,
        quantity: 1,
      });

      const { meta } = await orderItemService.deleteOrderItem(
        first.publicId,
        domain.owner.id
      );

      expect(meta.orderAutoCancelled).toBe(false);
      const reloaded = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(reloaded.status).toBe(OrderStatus.PENDING);
    });

    it("마지막 항목을 삭제하면 주문이 자동 취소된다", async () => {
      const order = await createOrderWithItem();
      const item = await firstItemOf(order);

      const { meta } = await orderItemService.deleteOrderItem(
        item.publicId,
        domain.owner.id
      );

      expect(meta.orderAutoCancelled).toBe(true);
      expect(meta.menuName).toBe("아메리카노");
      const reloaded = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      expect(reloaded.status).toBe(OrderStatus.CANCELLED);
    });
  });
});
