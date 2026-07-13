import { createSessionSchema } from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class CreateSessionPayloadDto extends createZodDto(
  createSessionSchema
) {}
