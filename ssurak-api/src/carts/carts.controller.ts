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
import { ApiTags } from "@nestjs/swagger";
import type {
  Cart,
  SessionWithTable,
  SyncNotice,
  CartWithNotice,
  CartWithOptionalNotice,
} from "@ssurak/db";
import {
  addCartItemPayloadSchema,
  cartItemIdSchema,
  updateCartItemPayloadSchema,
} from "@ssurak/schema";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { SessionAuth } from "src/utils/guards/table-session-auth.guard";
import { Session } from "src/decorators/session.decorator";
import { CartService } from "./carts.service";
import {
  CreateCartItemPayloadDto,
  UpdateCartItemPayloadDto,
} from "src/dto/request/cart.dto";
import {
  DocsCustomerCartGet,
  DocsCustomerCartAddItem,
  DocsCustomerCartUpdateItem,
  DocsCustomerCartRemoveItem,
  DocsCustomerCartClear,
} from "src/docs/cart.docs";
import { CartEventsService } from "src/realtime/cart-events.service";

@ApiTags("Customer Cart")
@Controller("sessions/carts")
@UseGuards(SessionAuth)
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly cartEvents: CartEventsService
  ) {}

  @Get()
  @DocsCustomerCartGet()
  async getCartList(@Session() session: SessionWithTable): Promise<Cart> {
    return this.cartService.getCart(session.sessionToken);
  }

  @Post()
  @UseGuards(ZodValidation({ body: addCartItemPayloadSchema }))
  @DocsCustomerCartAddItem()
  async addItem(
    @Session() session: SessionWithTable,
    @Body() addCartItemPayload: CreateCartItemPayloadDto,
    @Headers("socket-id") socketId?: string
  ): Promise<CartWithNotice> {
    const { cart, subscriber, meta } = await this.cartService.addItem(
      session,
      addCartItemPayload
    );

    const customerMessage = meta.isMerged
      ? `기존 장바구니의 ${meta.menuName} 수량이 합산되었습니다.`
      : `${meta.menuName} 메뉴가 장바구니에 추가되었습니다.`;

    const notice: SyncNotice = {
      level: "info",
      message: { customer: customerMessage },
    };

    this.cartEvents.emitCartAdd({
      subscriber: subscriber,
      payload: { notice, updatedAt: new Date(cart.updatedAt).toISOString() },
      excludeSocketId: socketId,
    });

    return { cart, notice };
  }

  @Patch(":cartItemId")
  @UseGuards(
    ZodValidation({
      params: cartItemIdSchema,
      body: updateCartItemPayloadSchema,
    })
  )
  @DocsCustomerCartUpdateItem()
  async updateItem(
    @Session() session: SessionWithTable,
    @Param("cartItemId") cartItemId: string,
    @Body() updateCartItemPayload: UpdateCartItemPayloadDto,
    @Headers("socket-id") socketId?: string
  ): Promise<CartWithOptionalNotice> {
    const { cart, subscriber, meta } = await this.cartService.updateItem(
      session,
      cartItemId,
      updateCartItemPayload
    );

    const notice: SyncNotice | undefined = meta.isMerged
      ? {
          level: "info",
          message: {
            customer: `옵션이 같아져 기존 ${meta.menuName} 메뉴와 합산되었습니다.`,
          },
        }
      : undefined;

    this.cartEvents.emitCartUpdated({
      subscriber,
      payload: {
        notice,
        updatedAt: new Date(cart.updatedAt).toISOString(),
      },
      excludeSocketId: socketId,
    });

    return { cart, notice };
  }

  @Delete(":cartItemId")
  @UseGuards(ZodValidation({ params: cartItemIdSchema }))
  @DocsCustomerCartRemoveItem()
  async removeItem(
    @Session() session: SessionWithTable,
    @Param("cartItemId") cartItemId: string,
    @Headers("socket-id") socketId?: string
  ): Promise<CartWithNotice> {
    const { cart, subscriber, meta } = await this.cartService.removeItem(
      session,
      cartItemId
    );

    const notice: SyncNotice = {
      level: "info",
      message: {
        customer: `${meta.menuName} 메뉴가 장바구니에서 제거되었습니다.`,
      },
    };

    this.cartEvents.emitCartDeleted({
      subscriber,
      payload: { notice, updatedAt: new Date(cart.updatedAt).toISOString() },
      excludeSocketId: socketId,
    });

    return { cart, notice };
  }

  @Delete()
  @DocsCustomerCartClear()
  async clearCart(
    @Session() session: SessionWithTable,
    @Headers("socket-id") socketId?: string
  ): Promise<void> {
    const subscriber = await this.cartService.clearCart(session);
    this.cartEvents.emitCartCleared({
      subscriber,
      payload: { updatedAt: new Date().toISOString() },
      excludeSocketId: socketId,
    });
  }
}
