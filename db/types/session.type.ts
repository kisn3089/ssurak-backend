import type { Category, Store, Table } from "@prisma/client";
import {
  PublicMenu,
  PublicMenuWithOptions,
  PublicStore,
  PublicTable,
} from "./publicModel.type";

export type CategoryWithMenus = Category & { menus: PublicMenuWithOptions[] };

export type TableWithStoreContext = Table & {
  store: Store & { categories: CategoryWithMenus[] };
};

/**
 * 점주 메뉴 목록. 옵션은 싣지 않는다 —
 * 옵션은 별도 API로 조회해 메뉴와 캐시를 따로 무효화한다.
 */
export type PublicCategoryWithMenus = Omit<Category, "id" | "storeId"> & {
  menus: PublicMenu[];
};

/** 고객 메뉴판. 주문 화면을 한 번에 그려야 하므로 옵션까지 함께 내려간다. */
export type PublicCategoryWithMenuOptions = Omit<Category, "id" | "storeId"> & {
  menus: PublicMenuWithOptions[];
};

export type PublicCategory = Omit<Category, "id" | "storeId">;

export type StoreContext = {
  table: PublicTable & {
    store: PublicStore & { categories: PublicCategoryWithMenuOptions[] };
  };
};
