import {
  createAdminPayloadSchema,
  updateAdminPayloadSchema,
} from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateAdminPayloadDto extends createZodDto(
  createAdminPayloadSchema
) {}

export class UpdateAdminPayloadDto extends createZodDto(
  updateAdminPayloadSchema
) {}
