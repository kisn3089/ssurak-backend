import { createZodDto } from "nestjs-zod";
import { publicStoreSchema } from "@ssurak/schema";

export class PublicStoreDto extends createZodDto(publicStoreSchema) {}
