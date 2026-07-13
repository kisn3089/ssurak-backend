import z from "zod";
import { commonSchema } from "./common.schema";
import { sessionTokenParamsSchema } from "./tableSession.schema";
import { storeIdParamsSchema } from "./store.schema";

export const cartItemIdSchema = z
  .object({ cartItemId: commonSchema.cuid2("CartItem") })
  .strict();

export const storeIdAndSessionTokenSchema = storeIdParamsSchema.merge(
  sessionTokenParamsSchema
);

const optionItemSchema = z.record(z.string(), z.string());

export const cartItemSchema = z.object({
  id: z.string(),
  menuPublicId: z.string(),
  menuName: z.string(),
  menuImageUrl: z.string().nullable(),
  basePrice: z.number(),
  optionsPrice: z.number(),
  unitPrice: z.number(),
  quantity: z.number().int().min(1),
  requiredOptions: optionItemSchema.optional(),
  customOptions: optionItemSchema.optional(),
  addedAt: z.string(),
  fingerprint: z.string(),
});

export const cartSchema = z.object({
  sessionToken: z.string(),
  menus: z.array(cartItemSchema),
  updatedAt: z.string(),
});

export const addCartItemPayloadSchema = z
  .object({
    menuPublicId: commonSchema.cuid2("Menu"),
    quantity: z.number().int().min(1, "수량은 최소 1 이상이어야 합니다."),
    requiredOptions: optionItemSchema.optional(),
    customOptions: optionItemSchema.optional(),
    menuName: z.string().optional(),
    price: z.number().optional(),
  })
  .strict();

export const updateCartItemPayloadSchema = addCartItemPayloadSchema
  .omit({ menuPublicId: true, menuName: true, price: true })
  .partial()
  .strict();
