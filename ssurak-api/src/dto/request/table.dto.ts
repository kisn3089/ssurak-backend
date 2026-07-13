import {
  createTablePayloadSchema,
  updateTablePayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateTablePayloadDto extends createZodDto(
  createTablePayloadSchema
) {}
export class UpdateTablePayloadDto extends createZodDto(
  updateTablePayloadSchema
) {}
