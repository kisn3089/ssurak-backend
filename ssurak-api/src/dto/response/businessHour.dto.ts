import { createZodDto } from "nestjs-zod";
import {
  publicBusinessHourSchema,
  publicClosureSchema,
  storeOpenStateSchema,
} from "@ssurak/schema";

export class PublicBusinessHourDto extends createZodDto(
  publicBusinessHourSchema
) {}

export class PublicClosureDto extends createZodDto(publicClosureSchema) {}

export class StoreOpenStateDto extends createZodDto(storeOpenStateSchema) {}
