import { createZodDto } from "nestjs-zod";
import {
  publicMenuOptionChoiceSchema,
  publicMenuOptionGroupSchema,
} from "@ssurak/schema";

export class PublicMenuOptionDto extends createZodDto(
  publicMenuOptionGroupSchema
) {}
export class PublicOptionChoiceDto extends createZodDto(
  publicMenuOptionChoiceSchema
) {}
