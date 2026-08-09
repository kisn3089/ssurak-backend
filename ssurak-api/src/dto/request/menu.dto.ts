import {
  bulkCreateMenusPayloadSchema,
  createMenuPayloadSchema,
  reorderMenusPayloadSchema,
  updateMenuPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class BulkCreateMenusPayloadDto extends createZodDto(
  bulkCreateMenusPayloadSchema
) {}

export class CreateMenuPayloadDto extends createZodDto(
  createMenuPayloadSchema
) {}
export class UpdateMenuPayloadDto extends createZodDto(
  updateMenuPayloadSchema
) {}
export class ReorderMenusPayloadDto extends createZodDto(
  reorderMenusPayloadSchema
) {}
