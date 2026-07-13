import {
  addCartItemPayloadSchema,
  updateCartItemPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateCartItemPayloadDto extends createZodDto(
  addCartItemPayloadSchema
) {}

export class UpdateCartItemPayloadDto extends createZodDto(
  updateCartItemPayloadSchema
) {}
