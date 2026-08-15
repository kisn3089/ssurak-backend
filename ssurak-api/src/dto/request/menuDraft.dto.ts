import { createZodDto } from "nestjs-zod";
import { updateMenuDraftPayloadSchema } from "@ssurak/schema";

export class UpdateMenuDraftPayloadDto extends createZodDto(
  updateMenuDraftPayloadSchema
) {}
