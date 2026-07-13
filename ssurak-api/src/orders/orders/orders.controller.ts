import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createOrderPayloadSchema,
  storeIdParamsSchema,
  updateOrderPayloadSchema,
  tableIdParamsSchema,
  orderIdParamsSchema,
} from "@ssurak/schema";
import {
  DocsOwnerOrderCancel,
  DocsOwnerOrderCreate,
  DocsOwnerOrderGetActiveSession,
  DocsOwnerOrderGetList,
  DocsOwnerOrderGetListByStore,
  DocsOwnerOrderGetBoard,
  DocsOwnerOrderGetUnique,
  DocsOwnerOrderUpdate,
} from "src/docs/ownerOrder.docs";
import { OrderStatus } from "@ssurak/db";
import type {
  Owner,
  ActiveSessionResponse,
  OrderBoardByStore,
  PublicOrderWithItem,
  SyncNotice,
} from "@ssurak/db";
import { Client } from "src/decorators/client.decorator";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { OrdersService } from "./orders.service";
import { OrderEventsService } from "src/realtime/order-events.service";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import {
  CreateOrderPayloadDto,
  UpdateOrderPayloadDto,
} from "src/dto/request/order.dto";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { OrderAccessGuard } from "src/utils/guards/order-access.guard";
import { TableAccessGuard } from "src/utils/guards/table-access.guard";
import { ORDER_ITEMS_WITH_OMIT_PRIVATE } from "src/common/query/order-item-query.const";
import { ORDER_STATUS_MESSAGE_MAP } from "./orders-status-notice-message.const";

@ApiTags("Order")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly orderService: OrdersService,
    private readonly orderEvents: OrderEventsService
  ) {}

  // ============================================================
  // Store Orders
  // ============================================================

  /** store의 모든 테이블 + 활성 세션의 full 주문을 한 번에 조회 (주문 보드 부트스트랩) */
  @Get("stores/:storeId/board")
  @UseGuards(StoreAccessGuard, ZodValidation({ params: storeIdParamsSchema }))
  @DocsOwnerOrderGetBoard()
  async getOrderBoard(
    @Client() client: Owner,
    @Param("storeId") storeId: string
  ): Promise<OrderBoardByStore<"Wide">> {
    return await this.orderService.getOrderBoard(client, storeId);
  }

  /** store에 속한 모든 주문 조회 */
  @Get("stores/:storeId/orders")
  @UseGuards(StoreAccessGuard, ZodValidation({ params: storeIdParamsSchema }))
  @DocsOwnerOrderGetListByStore()
  async listByStore(
    @Client() client: Owner,
    @Param("storeId") storeId: string
  ): Promise<PublicOrderWithItem<"Wide">[]> {
    return await this.orderService.getOrderList({
      where: { store: { publicId: storeId, ownerId: client.id } },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }

  /** 특정 주문 조회 */
  @Get(":orderId")
  @UseGuards(OrderAccessGuard, ZodValidation({ params: orderIdParamsSchema }))
  @DocsOwnerOrderGetUnique()
  async unique(
    @Client() client: Owner,
    @Param("orderId") orderId: string
  ): Promise<PublicOrderWithItem<"Wide">> {
    return await this.orderService.getOrderUnique({
      where: { publicId: orderId, store: { ownerId: client.id } },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }

  /** 특정 주문 부분 수정 */
  @Patch(":orderId")
  @UseGuards(
    OrderAccessGuard,
    ZodValidation({
      params: orderIdParamsSchema,
      body: updateOrderPayloadSchema,
    })
  )
  @DocsOwnerOrderUpdate()
  async partialUpdate(
    @Client() client: Owner,
    @Param("orderId") orderId: string,
    @Body() updatePayload: UpdateOrderPayloadDto,
    @Headers("socket-id") socketId?: string
  ): Promise<PublicOrderWithItem<"Wide">> {
    const { order, subscriber, meta } =
      await this.orderService.partialUpdateOrder(
        orderId,
        client.id,
        updatePayload
      );

    const notice: SyncNotice = {
      level: "info",
      message: ORDER_STATUS_MESSAGE_MAP[meta.orderStatus],
    };

    this.orderEvents.emitOrderUpdated({
      subscriber,
      payload: { notice },
      excludeSocketId: socketId,
    });
    return order;
  }

  /** 특정 주문 삭제(소프트) */
  @Delete(":orderId")
  @UseGuards(OrderAccessGuard, ZodValidation({ params: orderIdParamsSchema }))
  @DocsOwnerOrderCancel()
  async cancel(
    @Client() client: Owner,
    @Param("orderId") orderId: string,
    @Headers("socket-id") socketId?: string
  ): Promise<PublicOrderWithItem<"Wide">> {
    const { order, subscriber } = await this.orderService.cancelOrder({
      kind: "owner",
      orderId,
      ownerId: client.id,
    });

    const notice: SyncNotice = {
      level: "error",
      message: ORDER_STATUS_MESSAGE_MAP[OrderStatus.CANCELLED],
    };

    this.orderEvents.emitOrderCancelled({
      subscriber,
      payload: { notice },
      excludeSocketId: socketId,
    });
    return order;
  }

  // ============================================================
  // Table Orders
  // ============================================================

  /** 테이블의 활성 세션(full 주문 포함)을 조회 */
  @Get("tables/:tableId/active-session")
  @UseGuards(TableAccessGuard, ZodValidation({ params: tableIdParamsSchema }))
  @DocsOwnerOrderGetActiveSession()
  async getActiveSession(
    @Param("tableId") tableId: string
  ): Promise<ActiveSessionResponse<"Wide">> {
    return await this.orderService.getActiveSessionWithOrders(tableId);
  }

  /** table에 속한 주문 생성 */
  @Post("tables/:tableId/orders")
  @UseGuards(
    TableAccessGuard,
    ZodValidation({
      params: tableIdParamsSchema,
      body: createOrderPayloadSchema,
    })
  )
  @DocsOwnerOrderCreate()
  async create(
    @Param("tableId") tableId: string,
    @Body() createPayload: CreateOrderPayloadDto,
    @Headers("socket-id") socketId?: string
  ): Promise<PublicOrderWithItem<"Wide">> {
    const { order, subscriber, meta } =
      await this.orderService.createOrderByOwner(
        { publicId: tableId },
        createPayload
      );

    const notice: SyncNotice = {
      level: "success",
      message: {
        owner: `${meta?.tableNumber} 테이블에서 새 주문이 들어왔습니다.`,
        customer: "매장에서 주문을 생성하였습니다.",
      },
    };

    this.orderEvents.emitOrderCreated({
      subscriber,
      payload: { notice },
      excludeSocketId: socketId,
    });
    return order;
  }

  /** table에 속한 주문 조회 */
  @Get("tables/:tableId/orders")
  @UseGuards(TableAccessGuard, ZodValidation({ params: tableIdParamsSchema }))
  @DocsOwnerOrderGetList()
  async listByTable(
    @Client() client: Owner,
    @Param("tableId") tableId: string
  ): Promise<PublicOrderWithItem<"Wide">[]> {
    return await this.orderService.getOrderList({
      where: {
        table: { publicId: tableId, store: { ownerId: client.id } },
      },
      ...ORDER_ITEMS_WITH_OMIT_PRIVATE,
    });
  }
}
