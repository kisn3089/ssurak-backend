import z from "zod";

export const envSchemas = z
  .object({
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    OPENAI_MENU_VISION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(55_000),
    MENU_DRAFT_HOURLY_LIMIT: z.coerce.number().int().positive().default(10),
  })
  .passthrough();
