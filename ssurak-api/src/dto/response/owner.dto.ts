import { createZodDto } from "nestjs-zod";
import { publicOwnerSchema } from "@ssurak/schema";

export class PublicOwnerDto extends createZodDto(publicOwnerSchema) {}
