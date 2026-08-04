import {
  createStorePayloadSchema,
  updateStorePayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateStorePayloadDto extends createZodDto(
  createStorePayloadSchema
) {}
export class UpdateStorePayloadDto extends createZodDto(
  updateStorePayloadSchema
) {}
