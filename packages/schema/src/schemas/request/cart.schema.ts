import z from "zod";
import { optionSnapshotGroupSchema } from "../response/menuOption.response";
import { commonSchema } from "./common.schema";
import { menuOptionSelectionsSchema } from "./orderItem.schema";
import { sessionTokenParamsSchema } from "./tableSession.schema";
import { storeIdParamsSchema } from "./store.schema";

export const cartItemIdSchema = z
  .object({ cartItemId: commonSchema.cuid2("CartItem") })
  .strict();

export const storeIdAndSessionTokenSchema = storeIdParamsSchema.merge(
  sessionTokenParamsSchema
);

export const cartItemSchema = z.object({
  id: z.string(),
  menuPublicId: z.string(),
  menuName: z.string(),
  menuImageUrl: z.string().nullable(),
  basePrice: z.number(),
  optionsPrice: z.number(),
  unitPrice: z.number(),
  quantity: z.number().int().min(1),
  // 선택 id가 아니라 확정 스냅샷을 저장한다 — 장바구니 UI가 메뉴를 다시 조회하지 않아도 되고,
  // 주문 생성 시 재검증 입력으로 그대로 쓸 수 있다.
  options: z.array(optionSnapshotGroupSchema).optional(),
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
    options: menuOptionSelectionsSchema.optional(),
    menuName: z.string().optional(),
    price: z.number().optional(),
  })
  .strict();

export const updateCartItemPayloadSchema = addCartItemPayloadSchema
  .omit({ menuPublicId: true, menuName: true, price: true })
  .partial()
  .strict();
