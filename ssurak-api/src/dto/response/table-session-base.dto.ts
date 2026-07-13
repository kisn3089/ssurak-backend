import { createZodDto } from "nestjs-zod";
import { publicTableSessionSchema } from "@ssurak/schema";

export class TableSessionDto extends createZodDto(publicTableSessionSchema) {}
