import { createZodDto } from "nestjs-zod";
import { publicAdminSchema } from "@ssurak/schema";

export class PublicAdminDto extends createZodDto(publicAdminSchema) {}
