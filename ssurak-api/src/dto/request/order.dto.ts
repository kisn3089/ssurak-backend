import {
  createCustomerOrderPayloadSchema,
  createOrderPayloadSchema,
  updateOrderPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateOrderPayloadDto extends createZodDto(
  createOrderPayloadSchema
) {}
export class CreateCustomerOrderPayloadDto extends createZodDto(
  createCustomerOrderPayloadSchema
) {}
export class UpdateOrderPayloadDto extends createZodDto(
  updateOrderPayloadSchema
) {}
