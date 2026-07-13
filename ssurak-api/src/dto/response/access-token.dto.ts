import { createZodDto } from "nestjs-zod";
import { accessTokenResponseSchema } from "@ssurak/schema";

export class AccessTokenDto extends createZodDto(accessTokenResponseSchema) {}
