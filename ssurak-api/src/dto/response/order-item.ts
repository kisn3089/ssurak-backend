import { createZodDto } from "nestjs-zod";
import { publicOrderItemSchema } from "@ssurak/schema";

export class PublicOrderItemDto extends createZodDto(publicOrderItemSchema) {}
