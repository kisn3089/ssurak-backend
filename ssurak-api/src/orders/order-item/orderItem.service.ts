import { Injectable } from "@nestjs/common";
import { OrderStatus, Prisma, PublicOrderItem } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import {
  explicitOptionIdsOf,
  extractSelectionsFromSnapshot,
  getValidatedMenuOptionsSnapshot,
  mergeSelections,
} from "src/common/validate/menu/options";
import {
  CreateOrderItemPayloadDto,
  UpdateOrderItemPayloadDto,
} from "src/dto/request/order-item.dto";
import { validateOrderSessionToWrite } from "src/common/validate/order/order-session-to-write";
import { validateMenuAvailableOrThrow } from "src/common/validate/menu/available";
import { MENU_VALIDATION_FIELDS_SELECT } from "src/common/query/menu-query.const";
import { OrderSubscriber } from "src/realtime/order-events.service";
import { MetaInfo } from "src/realtime/realtime.constants";
import { withOrderLock } from "src/utils/helper/withOrderLock";
import { MenuImageService } from "src/common/image/menu-image.service";

type UpdatedOrderItem<MetaKeys extends keyof MetaInfoList = never> = {
  orderItem: PublicOrderItem<"Wide">;
  subscriber: OrderSubscriber;
} & MetaInfo<MetaInfoList, MetaKeys>;

type DeletedOrderItem<MetaKeys extends keyof MetaInfoList = never> = {
  subscriber: OrderSubscriber;
} & MetaInfo<MetaInfoList, MetaKeys>;

type MetaInfoList = {
  tableNumber: string;
  menuName: string;
  orderAutoCancelled: boolean;
};

/** 주문 항목 수정이 필요로 하는 주문 컨텍스트(세션 검증 + 실시간 구독 대상). */
const ORDER_CONTEXT_INCLUDE = {
  tableSession: true,
  store: { select: { publicId: true } },
  table: { select: { publicId: true, tableNumber: true } },
} as const;

@Injectable()
export class OrderItemService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly menuImageService: MenuImageService
  ) {}
  private readonly omitPrivate = {
    id: true,
    orderId: true,
    menuId: true,
  } as const;

  async createOrderItem(
    orderId: string,
    ownerId: bigint,
    createPayload: CreateOrderItemPayloadDto
  ): Promise<PublicOrderItem<"Wide">> {
    const { menuPublicId, options, quantity } = createPayload;

    const order = await this.prismaService.order.findFirstOrThrow({
      where: { publicId: orderId, store: { ownerId } },
      include: { tableSession: true, store: { select: { publicId: true } } },
    });

    validateOrderSessionToWrite(order);

    const menu = await this.prismaService.menu.findFirstOrThrow(
      this.buildMenuQuery(menuPublicId, order.store.publicId)
    );

    validateMenuAvailableOrThrow(menu);

    const { optionsPrice, optionsSnapshot } = getValidatedMenuOptionsSnapshot(
      menu,
      options
    );

    return await this.prismaService.orderItem.create({
      data: {
        menuId: menu.id,
        menuName: menu.name,
        menuImageUrl: this.menuImageService.thumbnailUrlOf(menu.imageKey),
        basePrice: menu.price,
        unitPrice: menu.price + optionsPrice,
        optionsPrice,
        quantity,
        orderId: order.id,
        optionsSnapshot,
      },
      omit: this.omitPrivate,
    });
  }

  private subscriberOf(order: {
    store: { publicId: string };
    table: { publicId: string };
  }): OrderSubscriber {
    return {
      storePublicId: order.store.publicId,
      tablePublicId: order.table.publicId,
    };
  }

  private buildMenuQuery(menuId: string | bigint, storeId: string) {
    const menuIdField =
      typeof menuId === "string" ? { publicId: menuId } : { id: menuId };

    return {
      where: {
        ...menuIdField,
        category: { store: { publicId: storeId } },
        deletedAt: null,
      },
      select: MENU_VALIDATION_FIELDS_SELECT,
    };
  }

  async getOrderItemsByOrder(
    orderId: string,
    ownerId: bigint
  ): Promise<PublicOrderItem<"Wide">[]> {
    return await this.prismaService.orderItem.findMany({
      where: { order: { publicId: orderId, store: { ownerId } } },
      omit: this.omitPrivate,
    });
  }

  async getOrderItemForOwner(
    orderItemId: string,
    ownerId: bigint
  ): Promise<PublicOrderItem<"Wide">> {
    return await this.prismaService.orderItem.findFirstOrThrow({
      where: { publicId: orderItemId, order: { store: { ownerId } } },
      omit: this.omitPrivate,
    });
  }

  async partialUpdateOrderItem(
    orderItemId: string,
    ownerId: bigint,
    updatePayload: UpdateOrderItemPayloadDto
  ): Promise<UpdatedOrderItem<"tableNumber">> {
    const { menuPublicId, options, quantity } = updatePayload;

    const whereCondition = {
      publicId: orderItemId,
      order: { store: { ownerId } },
    } as const;
    const updateWhereCondition = { publicId: orderItemId } as const;

    /**
     * 메뉴에 관한 업데이트가 없을 때.
     * 이 경우 메뉴를 조인하지 않는다 — 옵션이 관계가 된 뒤로 메뉴를 끌어오면
     * 옵션 그룹·선택지까지 딸려와서, 수량만 고치는 요청에는 순전한 낭비다.
     */
    if (!menuPublicId && !options) {
      const orderItem = await this.prismaService.orderItem.findFirstOrThrow({
        where: whereCondition,
        include: { order: { include: ORDER_CONTEXT_INCLUDE } },
      });
      const validatedOrder = validateOrderSessionToWrite(orderItem.order);

      const updatedOrderItem = await this.prismaService.orderItem.update({
        where: updateWhereCondition,
        data: updatePayload,
        omit: this.omitPrivate,
      });

      return {
        orderItem: updatedOrderItem,
        subscriber: this.subscriberOf(validatedOrder),
        meta: { tableNumber: validatedOrder.table.tableNumber },
      };
    }

    const orderItem = await this.prismaService.orderItem.findFirstOrThrow({
      where: whereCondition,
      include: {
        menu: { select: MENU_VALIDATION_FIELDS_SELECT },
        order: { include: ORDER_CONTEXT_INCLUDE },
      },
    });

    const validatedOrder = validateOrderSessionToWrite(orderItem.order);
    const subscriber = this.subscriberOf(validatedOrder);
    const tableNumber = validatedOrder.table.tableNumber;

    /** menuPublicId가 있으면 새 메뉴 조회, 없으면 기존 메뉴 사용 */
    const menu = menuPublicId
      ? await this.prismaService.menu.findFirstOrThrow(
          this.buildMenuQuery(menuPublicId, orderItem.order.store.publicId)
        )
      : orderItem.menu;

    validateMenuAvailableOrThrow(menu);

    /**
     * 같은 메뉴의 옵션 부분 업데이트면 페이로드에 없는 그룹은 기존 선택을 유지한다.
     * 메뉴 자체가 바뀌면 기존 스냅샷은 새 메뉴에 유효하지 않으므로 병합하지 않는다.
     */
    const existingSelections =
      menu.id === orderItem.menuId
        ? extractSelectionsFromSnapshot(orderItem.optionsSnapshot)
        : undefined;

    const { optionsPrice, optionsSnapshot } = getValidatedMenuOptionsSnapshot(
      menu,
      mergeSelections(existingSelections, options),
      { explicitOptionIds: explicitOptionIdsOf(options) }
    );

    const updatedOrderItem = await this.prismaService.orderItem.update({
      where: updateWhereCondition,
      data: {
        menu: { connect: { id: menu.id } },
        menuName: menu.name,
        menuImageUrl: this.menuImageService.thumbnailUrlOf(menu.imageKey),
        basePrice: menu.price,
        unitPrice: menu.price + optionsPrice,
        optionsPrice,
        quantity,
        optionsSnapshot: optionsSnapshot ?? Prisma.DbNull,
      },
      omit: this.omitPrivate,
    });

    return {
      orderItem: updatedOrderItem,
      subscriber,
      meta: { tableNumber },
    };
  }

  async deleteOrderItem(
    orderItemId: string,
    ownerId: bigint
  ): Promise<
    DeletedOrderItem<"tableNumber" | "menuName" | "orderAutoCancelled">
  > {
    return await this.prismaService.$transaction(async (tx) => {
      const parentOrder = await tx.order.findFirst({
        where: {
          store: { ownerId },
          orderItems: { some: { publicId: orderItemId } },
        },
        include: {
          tableSession: true,
          store: { select: { publicId: true } },
          table: { select: { publicId: true, tableNumber: true } },
        },
      });

      const validatedOrder = validateOrderSessionToWrite(parentOrder);

      return await withOrderLock(tx, validatedOrder.id, async () => {
        const { menuName } = await tx.orderItem.delete({
          where: { publicId: orderItemId },
        });

        const rows = await tx.$queryRaw<{ cnt: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS cnt
          FROM \`order_item\`
          WHERE order_id = ${validatedOrder.id}
          FOR UPDATE
        `);

        const orderAutoCancelled = Number(rows[0].cnt) === 0;
        if (orderAutoCancelled) {
          await tx.order.update({
            where: { id: validatedOrder.id },
            data: { status: OrderStatus.CANCELLED },
          });
        }

        return {
          subscriber: {
            storePublicId: validatedOrder.store.publicId,
            tablePublicId: validatedOrder.table.publicId,
          },
          meta: {
            tableNumber: validatedOrder.table.tableNumber,
            menuName,
            orderAutoCancelled,
          },
        };
      });
    });
  }
}
