import type { Category, Store, Table } from "@prisma/client";
import { PublicMenu, PublicStore, PublicTable } from "./publicModel.type";

export type CategoryWithMenus = Category & { menus: PublicMenu[] };

export type TableWithStoreContext = Table & {
  store: Store & { categories: CategoryWithMenus[] };
};

export type PublicCategoryWithMenus = Omit<Category, "id" | "storeId"> & {
  menus: PublicMenu[];
};

export type StoreContext = {
  table: PublicTable & {
    store: PublicStore & { categories: PublicCategoryWithMenus[] };
  };
};
