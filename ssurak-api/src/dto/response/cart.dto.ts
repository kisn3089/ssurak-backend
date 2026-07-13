import { createZodDto } from "nestjs-zod";
import {
  cartItemSchema,
  cartSchema,
  cartWithNoticeSchema,
  cartWithOptionalNoticeSchema,
  syncNoticeMessageSchema,
  syncNoticeSchema,
} from "@ssurak/schema";

export class PublicCartItemDto extends createZodDto(cartItemSchema) {}

export class CartDataDto extends createZodDto(cartSchema) {}

export class SyncNoticeMessageDto extends createZodDto(
  syncNoticeMessageSchema
) {}

export class SyncNoticeDto extends createZodDto(syncNoticeSchema) {}

export class CartWithNoticeDto extends createZodDto(cartWithNoticeSchema) {}

export class CartWithOptionalNoticeDto extends createZodDto(
  cartWithOptionalNoticeSchema
) {}
