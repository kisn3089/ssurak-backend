import {
  createMenuOptionPayloadSchema,
  createOptionChoicePayloadSchema,
  reorderMenuOptionsPayloadSchema,
  reorderOptionChoicesPayloadSchema,
  updateMenuOptionPayloadSchema,
  updateOptionChoicePayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateMenuOptionPayloadDto extends createZodDto(
  createMenuOptionPayloadSchema
) {}
export class UpdateMenuOptionPayloadDto extends createZodDto(
  updateMenuOptionPayloadSchema
) {}
export class ReorderMenuOptionsPayloadDto extends createZodDto(
  reorderMenuOptionsPayloadSchema
) {}
export class CreateOptionChoicePayloadDto extends createZodDto(
  createOptionChoicePayloadSchema
) {}
export class UpdateOptionChoicePayloadDto extends createZodDto(
  updateOptionChoicePayloadSchema
) {}
export class ReorderOptionChoicesPayloadDto extends createZodDto(
  reorderOptionChoicesPayloadSchema
) {}
