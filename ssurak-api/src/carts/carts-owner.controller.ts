import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { storeIdAndSessionTokenSchema } from "@ssurak/schema";
import { ZodValidation } from "src/utils/guards/zod-validation.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { CartService } from "./carts.service";
import { SessionAuth } from "src/utils/guards/table-session-auth.guard";
import { DocsOwnerCartGet } from "src/docs/cart.docs";
import { Cart } from "@ssurak/db";

@ApiTags("Owner Cart")
@Controller(":storeId/sessions/:sessionToken/carts")
@UseGuards(JwtAuthGuard, StoreAccessGuard, SessionAuth)
export class CartOwnerController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @UseGuards(ZodValidation({ params: storeIdAndSessionTokenSchema }))
  @DocsOwnerCartGet()
  async getCart(
    @Param("storeId") storeId: string,
    @Param("sessionToken") sessionToken: string
  ): Promise<Cart> {
    return this.cartService.getCartByStore(storeId, sessionToken);
  }
}
