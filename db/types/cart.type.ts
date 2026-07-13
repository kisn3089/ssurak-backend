import { PublicOrderItem } from "./publicModel.type";
import { SyncNotice } from "./syncNotice.type";

export type PublicCartItem = Omit<PublicOrderItem, "publicId" | "createdAt"> & {
  id: string;
  menuPublicId: string;
  requiredOptions?: Record<string, string>;
  customOptions?: Record<string, string>;
  addedAt: string;
  fingerprint: string;
};

export type Cart = {
  sessionToken: string;
  menus: PublicCartItem[];
  updatedAt: string;
};

export type CartWithNotice = {
  cart: Cart;
  notice: SyncNotice;
};

export type CartWithOptionalNotice = {
  cart: Cart;
  notice?: SyncNotice;
};
