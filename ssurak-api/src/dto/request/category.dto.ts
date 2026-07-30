import {
  createCategoryPayloadSchema,
  reorderCategoriesPayloadSchema,
  updateCategoryPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateCategoryPayloadDto extends createZodDto(
  createCategoryPayloadSchema
) {}
export class UpdateCategoryPayloadDto extends createZodDto(
  updateCategoryPayloadSchema
) {}
export class ReorderCategoriesPayloadDto extends createZodDto(
  reorderCategoriesPayloadSchema
) {}
