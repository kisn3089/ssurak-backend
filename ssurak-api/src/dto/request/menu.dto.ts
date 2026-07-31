import {
  createMenuPayloadSchema,
  reorderMenusPayloadSchema,
  updateMenuPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateMenuPayloadDto extends createZodDto(
  createMenuPayloadSchema
) {}
export class UpdateMenuPayloadDto extends createZodDto(
  updateMenuPayloadSchema
) {}
export class ReorderMenusPayloadDto extends createZodDto(
  reorderMenusPayloadSchema
) {}
