import { createZodDto } from "nestjs-zod";
import { publicOrderSchema, publicOrderWithItemsSchema } from "@ssurak/schema";

/** 주문 응답 DTO */
export class PublicOrderDto extends createZodDto(publicOrderSchema) {}

/** 주문 + 주문 항목 응답 DTO */
export class PublicOrderWithItemsDto extends createZodDto(
  publicOrderWithItemsSchema
) {}
