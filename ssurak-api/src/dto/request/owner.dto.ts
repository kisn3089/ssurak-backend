import {
  createOwnerPayloadSchema,
  updateOwnerPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateOwnerPayloadDto extends createZodDto(
  createOwnerPayloadSchema
) {}
export class UpdateOwnerPayloadDto extends createZodDto(
  updateOwnerPayloadSchema
) {}
