import { Prisma, TableSessionStatus } from "@ssurak/db";
import { MENU_OPTIONS_INCLUDE_CUSTOMER } from "./menu-query.const";

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
export const OMIT_MENU_PRIVATE = { id: true } as const;

export const CATEGORY_ORDER_BY: Prisma.CategoryOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { id: "asc" },
];
export const MENU_ORDER_BY: Prisma.MenuOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { id: "asc" },
];
const MENUS_IN_CATEGORY = {
  where: AVAILABLE_MENU_FILTER,
  orderBy: MENU_ORDER_BY,
  omit: OMIT_MENU_PRIVATE,
} as const;

/**
 * 고객 메뉴판용. 비활성 옵션 그룹과 HIDDEN 선택지는 응답에 실리지 않는다.
 * 점주 콘솔은 이걸 쓰면 안 된다 — 안 보이는 항목을 담아 다시 저장하면 조용히 삭제된다.
 */
export const CATEGORIES = {
  orderBy: CATEGORY_ORDER_BY,
  include: {
    menus: { ...MENUS_IN_CATEGORY, include: MENU_OPTIONS_INCLUDE_CUSTOMER },
  },
} as const;

/**
 * 점주 메뉴 목록용. 옵션은 싣지 않는다 — 옵션이 바뀔 때마다 메뉴 목록 캐시까지
 * 무효화하지 않도록 옵션 API(`/menus/{menuId}/options`)로 따로 조회한다.
 */
export const CATEGORIES_FOR_OWNER = {
  orderBy: CATEGORY_ORDER_BY,
  include: { menus: MENUS_IN_CATEGORY },
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
