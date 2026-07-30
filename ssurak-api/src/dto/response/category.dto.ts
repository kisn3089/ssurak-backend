import { createZodDto } from "nestjs-zod";
import { publicCategorySchema } from "@ssurak/schema";

export class PublicCategoryDto extends createZodDto(publicCategorySchema) {}
