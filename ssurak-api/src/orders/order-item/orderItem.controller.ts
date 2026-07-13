import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OrderItemService } from "./orderItem.service";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import {
  createOrderItemPayloadSchema,
  orderIdParamsSchema,
  orderItemIdParamsSchema,
  partialUpdateOrderItemPayloadSchema,
} from "@ssurak/schema";
import type { PublicOrderItem, SyncNotice } from "@ssurak/db";
import {
  DocsOrderItemCreate,
  DocsOrderItemDelete,
  DocsOrderItemGetList,
  DocsOrderItemGetUnique,
  DocsOrderItemUpdate,
} from "src/docs/orderItem.docs";
import {
  CreateOrderItemPayloadDto,
  UpdateOrderItemPayloadDto,
} from "src/dto/request/order-item.dto";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { OrderAccessGuard } from "src/utils/guards/order-access.guard";
import { OrderItemAccessGuard } from "src/utils/guards/order-item-access.guard";
import { Client } from "src/decorators/client.decorator";
import type { Owner } from "@ssurak/db";
import { OrderEventsService } from "src/realtime/order-events.service";

@ApiTags("Order Item")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class OrderItemController {
  constructor(
    private readonly orderItemService: OrderItemService,
    private readonly orderEvents: OrderEventsService
  ) {}

  @Post(":orderId/order-items")
  @UseGuards(
    OrderAccessGuard,
    ZodValidation({
      params: orderIdParamsSchema,
      body: createOrderItemPayloadSchema,
    })
  )
  @DocsOrderItemCreate()
  async create(
    @Client() client: Owner,
    @Param("orderId") orderId: string,
    @Body() createOrderItemPayload: CreateOrderItemPayloadDto
  ): Promise<PublicOrderItem<"Wide">> {
    return await this.orderItemService.createOrderItem(
      orderId,
      client.id,
      createOrderItemPayload
    );
  }

  @Get(":orderId/order-items")
  @UseGuards(OrderAccessGuard, ZodValidation({ params: orderIdParamsSchema }))
  @DocsOrderItemGetList()
  async list(
    @Client() client: Owner,
    @Param("orderId") orderId: string
  ): Promise<PublicOrderItem<"Wide">[]> {
    return await this.orderItemService.getOrderItemList({
      where: {
        order: { publicId: orderId, store: { ownerId: client.id } },
      },
      omit: this.orderItemService.omitPrivate,
    });
  }

  @Get("order-items/:orderItemId")
  @UseGuards(
    OrderItemAccessGuard,
    ZodValidation({ params: orderItemIdParamsSchema })
  )
  @DocsOrderItemGetUnique()
  async getUnique(
    @Client() client: Owner,
    @Param("orderItemId") orderItemId: string
  ): Promise<PublicOrderItem<"Wide">> {
    return await this.orderItemService.getOrderItemUnique({
      where: {
        publicId: orderItemId,
        order: { store: { ownerId: client.id } },
      },
      omit: this.orderItemService.omitPrivate,
    });
  }

  @Patch("order-items/:orderItemId")
  @UseGuards(
    OrderItemAccessGuard,
    ZodValidation({
      params: orderItemIdParamsSchema,
      body: partialUpdateOrderItemPayloadSchema,
    })
  )
  @DocsOrderItemUpdate()
  async partialUpdate(
    @Client() client: Owner,
    @Param("orderItemId") orderItemId: string,
    @Body() updateOrderItemDto: UpdateOrderItemPayloadDto,
    @Headers("socket-id") socketId?: string
  ): Promise<PublicOrderItem<"Wide">> {
    const { orderItem, subscriber, meta } =
      await this.orderItemService.partialUpdateOrderItem(
        orderItemId,
        client.id,
        updateOrderItemDto
      );

    const notice: SyncNotice = {
      level: "info",
      message: {
        owner: `${meta.tableNumber} 테이블 ${orderItem.menuName} 수량을 ${orderItem.quantity}개로 변경했습니다.`,
        customer: `매장에서 ${orderItem.menuName} 수량을 ${orderItem.quantity}개로 변경했습니다.`,
      },
    };

    this.orderEvents.emitOrderItemUpdated({
      subscriber,
      payload: { notice },
      excludeSocketId: socketId,
    });

    return orderItem;
  }

  @Delete("order-items/:orderItemId")
  @UseGuards(
    OrderItemAccessGuard,
    ZodValidation({ params: orderItemIdParamsSchema })
  )
  @HttpCode(204)
  @DocsOrderItemDelete()
  async delete(
    @Client() client: Owner,
    @Param("orderItemId") orderItemId: string,
    @Headers("socket-id") socketId?: string
  ): Promise<void> {
    const { subscriber, meta } = await this.orderItemService.deleteOrderItem(
      orderItemId,
      client.id
    );

    const emitOrderItem = { subscriber, excludeSocketId: socketId };

    if (meta.orderAutoCancelled) {
      const notice: SyncNotice = {
        level: "info",
        message: {
          owner: `${meta.tableNumber} 테이블 ${meta.menuName} 메뉴 제외로 주문이 자동 취소되었습니다.`,
          customer: `매장에서 ${meta.menuName} 메뉴 제외로 주문이 자동 취소되었습니다.`,
        },
      };
      this.orderEvents.emitOrderCancelled({
        ...emitOrderItem,
        payload: { notice },
      });
      return;
    }

    const notice: SyncNotice = {
      level: "info",
      message: {
        owner: `${meta.tableNumber} 테이블 ${meta.menuName} 메뉴가 주문에서 제외되었습니다.`,
        customer: `매장에서 ${meta.menuName} 메뉴를 주문에서 제외하였습니다.`,
      },
    };

    this.orderEvents.emitOrderItemRemoved({
      ...emitOrderItem,
      payload: { notice },
    });
  }
}
