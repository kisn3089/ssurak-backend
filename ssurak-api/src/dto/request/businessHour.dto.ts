import {
  createClosurePayloadSchema,
  closureRangeQuerySchema,
  replaceBusinessHoursPayloadSchema,
  updateClosurePayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class ReplaceBusinessHoursPayloadDto extends createZodDto(
  replaceBusinessHoursPayloadSchema
) {}

export class CreateClosurePayloadDto extends createZodDto(
  createClosurePayloadSchema
) {}

export class UpdateClosurePayloadDto extends createZodDto(
  updateClosurePayloadSchema
) {}

export class ClosureRangeQueryDto extends createZodDto(
  closureRangeQuerySchema
) {}
