import { createZodDto } from "nestjs-zod";
import { menuDraftResponseSchema } from "@ssurak/schema";

export class MenuDraftResponseDto extends createZodDto(
  menuDraftResponseSchema
) {}
