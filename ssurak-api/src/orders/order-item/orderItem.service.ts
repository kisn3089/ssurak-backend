import { Injectable } from "@nestjs/common";
import { OrderStatus, Prisma, PublicOrderItem } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import {
  extractSelectionsFromSnapshot,
  getValidatedMenuOptionsSnapshot,
} from "src/common/validate/menu/options";
import {
  CreateOrderItemPayloadDto,
  UpdateOrderItemPayloadDto,
} from "src/dto/request/order-item.dto";
import { Tx } from "src/utils/helper/transactionPipe";
import { validateOrderSessionToWrite } from "src/common/validate/order/order-session-to-write";
import { validateMenuAvailableOrThrow } from "src/common/validate/menu/available";
import { MENU_VALIDATION_FIELDS_SELECT } from "src/common/query/menu-query.const";
import { OrderSubscriber } from "src/realtime/order-events.service";
import { MetaInfo } from "src/realtime/realtime.constants";
import { withOrderLock } from "src/utils/helper/withOrderLock";

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

@Injectable()
export class OrderItemService {
  constructor(private readonly prismaService: PrismaService) {}
  readonly omitPrivate = { id: true, orderId: true, menuId: true } as const;

  async createOrderItem(
    orderId: string,
    ownerId: bigint,
    createPayload: CreateOrderItemPayloadDto
  ): Promise<PublicOrderItem<"Wide">> {
    const { menuPublicId, requiredOptions, customOptions, quantity } =
      createPayload;

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
      {
        requiredOptions,
        customOptions,
      }
    );

    return await this.prismaService.orderItem.create({
      data: {
        menuId: menu.id,
        menuName: menu.name,
        menuImageUrl: menu.imageUrl,
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

  async getOrderItemList<T extends Prisma.OrderItemFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderItemFindManyArgs>
  ): Promise<Prisma.OrderItemGetPayload<T>[]> {
    return await this.prismaService.orderItem.findMany(args);
  }

  async getOrderItemUnique<T extends Prisma.OrderItemFindFirstOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderItemFindFirstOrThrowArgs>,
    tx?: Tx
  ): Promise<Prisma.OrderItemGetPayload<T>> {
    const service = tx ?? this.prismaService;
    return await service.orderItem.findFirstOrThrow(args);
  }

  async partialUpdateOrderItem(
    orderItemId: string,
    ownerId: bigint,
    updatePayload: UpdateOrderItemPayloadDto
  ): Promise<UpdatedOrderItem<"tableNumber">> {
    const { menuPublicId, requiredOptions, customOptions, quantity } =
      updatePayload;

    const whereCondition = {
      publicId: orderItemId,
      order: { store: { ownerId } },
    } as const;
    const updateWhereCondition = { publicId: orderItemId } as const;

    /** 메뉴에 관한 업데이트가 없을 때 */
    const isNotMenuUpdate = !menuPublicId && !requiredOptions && !customOptions;
    const includeMenu = isNotMenuUpdate
      ? {}
      : { menu: { select: MENU_VALIDATION_FIELDS_SELECT } };

    const orderItem = await this.prismaService.orderItem.findFirstOrThrow({
      where: whereCondition,
      include: {
        ...includeMenu,
        order: {
          include: {
            tableSession: true,
            store: { select: { publicId: true } },
            table: { select: { publicId: true, tableNumber: true } },
          },
        },
      },
    });

    const validatedOrder = validateOrderSessionToWrite(orderItem.order);

    const subscriber = {
      storePublicId: validatedOrder.store.publicId,
      tablePublicId: validatedOrder.table.publicId,
    };

    const tableNumber = validatedOrder.table.tableNumber;

    if (isNotMenuUpdate) {
      const updatedOrderItem = await this.prismaService.orderItem.update({
        where: updateWhereCondition,
        data: updatePayload,
        omit: this.omitPrivate,
      });

      return {
        orderItem: updatedOrderItem,
        subscriber,
        meta: { tableNumber },
      };
    }

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
        : {};

    const { optionsPrice, optionsSnapshot } = getValidatedMenuOptionsSnapshot(
      menu,
      {
        requiredOptions: requiredOptions ?? existingSelections.requiredOptions,
        customOptions: customOptions ?? existingSelections.customOptions,
      }
    );

    const updatedOrderItem = await this.prismaService.orderItem.update({
      where: updateWhereCondition,
      data: {
        menu: { connect: { id: menu.id } },
        menuName: menu.name,
        menuImageUrl: menu.imageUrl,
        basePrice: menu.price,
        unitPrice: menu.price + optionsPrice,
        optionsPrice,
        quantity,
        optionsSnapshot,
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
