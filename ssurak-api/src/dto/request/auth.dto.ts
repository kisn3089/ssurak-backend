import { signInPayloadSchema } from "@ssurak/schema";
import { createZodDto } from "nestjs-zod";

export class SignInPayloadDto extends createZodDto(signInPayloadSchema) {}
