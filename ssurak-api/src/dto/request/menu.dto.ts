import {
  createMenuPayloadSchema,
  updateMenuPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateMenuPayloadDto extends createZodDto(
  createMenuPayloadSchema
) {}
export class UpdateMenuPayloadDto extends createZodDto(
  updateMenuPayloadSchema
) {}
