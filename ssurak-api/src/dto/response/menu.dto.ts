import { createZodDto } from "nestjs-zod";
import { publicMenuSchema } from "@ssurak/schema";

export class PublicMenuDto extends createZodDto(publicMenuSchema) {}
