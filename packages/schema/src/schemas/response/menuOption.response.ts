import z from "zod";
import type {
  MenuCustomOption,
  MenuRequiredOption,
  OrderItemOptionSnapshot,
} from "../../types/menu/menuOptions.interface";

const menuOptionValueSchema = z.object({
  key: z.string(),
  description: z.string().optional(),
  price: z.number(),
});

export const menuRequiredOptionSchema = z.record(
  z.string(),
  z.object({
    options: z.array(menuOptionValueSchema),
    defaultKey: z.string(),
  })
) satisfies z.ZodType<MenuRequiredOption, z.ZodTypeDef, unknown>;

export const menuCustomOptionSchema = z.record(
  z.string(),
  z.object({
    options: z.array(menuOptionValueSchema),
    trigger: z
      .array(z.object({ group: z.string(), in: z.array(z.string()) }))
      .optional(),
    defaultKey: z.string(),
  })
) satisfies z.ZodType<MenuCustomOption, z.ZodTypeDef, unknown>;

export const orderItemOptionSnapshotSchema = z.object({
  requiredOptions: z.record(z.string(), menuOptionValueSchema).optional(),
  customOptions: z.record(z.string(), menuOptionValueSchema).optional(),
}) satisfies z.ZodType<OrderItemOptionSnapshot, z.ZodTypeDef, unknown>;
