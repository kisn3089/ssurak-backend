import type { Response } from "express";
import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  Delete,
  UseGuards,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SessionAuth } from "src/utils/guards/table-session-auth.guard";
import {
  COOKIE_TABLE,
  OrderStatus,
  SyncNotice,
  type PublicOrderWithItem,
  type SessionWithTable,
  type TableSession,
} from "@ssurak/db";
import {
  createCustomerOrderPayloadSchema,
  orderIdParamsSchema,
} from "@ssurak/schema";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { Session } from "src/decorators/session.decorator";
import {
  DocsCustomerOrderCreate,
  DocsCustomerOrderDelete,
  DocsCustomerOrderGetList,
  DocsCustomerOrderGetUnique,
} from "src/docs/order.docs";
import { CreateCustomerOrderPayloadDto } from "src/dto/request/order.dto";
import { OrdersService } from "./orders.service";
import { responseCookie } from "src/utils/cookies";
import { OrderEventsService } from "src/realtime/order-events.service";
import { ORDER_STATUS_MESSAGE_MAP } from "./orders-status-notice-message.const";

@ApiTags("Customer Order")
@Controller("sessions/orders")
@UseGuards(SessionAuth)
export class CustomerOrdersController {
  constructor(
    private readonly orderService: OrdersService,
    private readonly orderEvents: OrderEventsService
  ) {}

  @Post()
  @UseGuards(ZodValidation({ body: createCustomerOrderPayloadSchema }))
  @DocsCustomerOrderCreate()
  async create(
    @Session() session: SessionWithTable,
    @Body() createOrderPayload: CreateCustomerOrderPayloadDto,
    @Res({ passthrough: true }) response: Response,
    @Headers("socket-id") socketId?: string
  ): Promise<
    PublicOrderWithItem<"Wide", { sessionToken: string; expiresAt: Date }>
  > {
    const { order, subscriber, meta } =
      await this.orderService.createOrderByCustomer(
        session,
        createOrderPayload
      );

    responseCookie.set(
      response,
      COOKIE_TABLE.SESSION_TOKEN,
      order.tableSession.sessionToken,
      {
        expires: order.tableSession.expiresAt,
      }
    );

    const notice: SyncNotice = {
      level: "success",
      message: {
        owner: `${meta?.tableNumber} 테이블에서 새 주문이 들어왔습니다.`,
        customer: "주문이 완료되었습니다 🎉",
      },
    };

    if (!meta.deduplicated) {
      this.orderEvents.emitOrderCreated({
        subscriber,
        payload: { notice },
        excludeSocketId: socketId,
      });
    }

    return order;
  }

  @Get()
  @DocsCustomerOrderGetList()
  async list(
    @Session() tableSession: TableSession
  ): Promise<PublicOrderWithItem<"Wide">[]> {
    return await this.orderService.getOrdersBySession(tableSession.id);
  }

  @Get(":orderId")
  @UseGuards(ZodValidation({ params: orderIdParamsSchema }))
  @DocsCustomerOrderGetUnique()
  async unique(
    @Session() tableSession: TableSession,
    @Param("orderId") orderId: string
  ): Promise<PublicOrderWithItem<"Wide">> {
    return await this.orderService.getOrderForSession(orderId, tableSession.id);
  }

  @Delete(":orderId")
  @UseGuards(ZodValidation({ params: orderIdParamsSchema }))
  @DocsCustomerOrderDelete()
  async delete(
    @Session() tableSession: TableSession,
    @Param("orderId") orderId: string,
    @Headers("socket-id") socketId?: string
  ): Promise<PublicOrderWithItem<"Wide">> {
    const { order, subscriber } = await this.orderService.cancelOrder({
      kind: "customer",
      orderId,
      tableSession,
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
}
