import { createZodDto } from "nestjs-zod";
import {
  menuDraftListResponseSchema,
  menuDraftResponseSchema,
} from "@ssurak/schema";

export class MenuDraftResponseDto extends createZodDto(
  menuDraftResponseSchema
) {}

export class MenuDraftListResponseDto extends createZodDto(
  menuDraftListResponseSchema
) {}
