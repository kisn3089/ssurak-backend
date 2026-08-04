import { OptionSnapshotGroup } from "./menuOptions.type";
import { PublicOrderItem } from "./publicModel.type";
import { SyncNotice } from "./syncNotice.type";

export type PublicCartItem = Omit<
  PublicOrderItem,
  "publicId" | "createdAt" | "optionsSnapshot"
> & {
  id: string;
  menuPublicId: string;
  options?: OptionSnapshotGroup[];
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
