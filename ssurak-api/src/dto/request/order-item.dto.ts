import {
  createOrderItemPayloadSchema,
  updateOrderItemPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateOrderItemPayloadDto extends createZodDto(
  createOrderItemPayloadSchema
) {}
export class UpdateOrderItemPayloadDto extends createZodDto(
  updateOrderItemPayloadSchema
) {}
