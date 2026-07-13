export const ORDER_ITEMS_WITH_OMIT_PRIVATE = {
  include: {
    orderItems: { omit: { id: true, orderId: true, menuId: true } },
  },
  omit: {
    id: true,
    storeId: true,
    tableId: true,
    tableSessionId: true,
  },
} as const;
