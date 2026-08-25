import { createZodDto } from "nestjs-zod";
import { publicMenuSchema, publicRestorableMenuSchema } from "@ssurak/schema";

export class PublicMenuDto extends createZodDto(publicMenuSchema) {}

export class PublicRestorableMenuDto extends createZodDto(
  publicRestorableMenuSchema
) {}
