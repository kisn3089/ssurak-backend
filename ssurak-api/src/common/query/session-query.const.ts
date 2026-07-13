import { TableSessionStatus } from "@ssurak/db";

/** Statuses */
export const ALIVE_SESSION_STATUSES = [
  TableSessionStatus.ACTIVE,
  TableSessionStatus.WAITING_ORDER,
];

/** Expires */
export const TWO_HOURS = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
export const TWENTY_MINUTE = () => new Date(Date.now() + 20 * 60 * 1000);
export const ONE_HOURS = (expiresAt: Date) =>
  new Date(expiresAt.getTime() + 60 * 60 * 1000);

/** Omit */
const ORDERS_OMIT = {
  id: true,
  storeId: true,
  tableId: true,
  tableSessionId: true,
} as const;

export const SESSION_OMIT = { id: true, tableId: true } as const;

/** Include */
export const INCLUDE_TABLE = {
  table: { include: { store: { select: { publicId: true } } } },
} as const;

const AVAILABLE_MENU_FILTER = { deletedAt: null } as const;
export const OMIT_MENU_PRIVATE = { id: true, categoryId: true } as const;
export const OMIT_CATEGORY_PRIVATE = { id: true, storeId: true } as const;
export const CATEGORIES = {
  orderBy: { sortOrder: "asc" },
  include: {
    menus: {
      where: AVAILABLE_MENU_FILTER,
      orderBy: { sortOrder: "asc" },
      omit: OMIT_MENU_PRIVATE,
    },
  },
} as const;

export const INCLUDE_TABLE_STORE_AVAILABLE_MENUS = {
  table: { include: { store: { include: { categories: CATEGORIES } } } },
} as const;

/** Query Record */
export const ORDER_WITH_ITEMS_RECORD = {
  include: { orderItems: { omit: { id: true, orderId: true, menuId: true } } },
  omit: ORDERS_OMIT,
} as const;

/** Query filter */
export const aliveSessionFilter = () => ({
  where: {
    status: { in: ALIVE_SESSION_STATUSES },
    expiresAt: { gt: new Date() },
  },
  take: 1,
  orderBy: { createdAt: "desc" as const },
});
