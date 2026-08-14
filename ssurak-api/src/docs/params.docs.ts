import {
  ACTIVATED_TABLE,
  ALIVE_SESSION,
  ENDED_SESSION,
  ORDER_ITEMS,
  ORDERS,
} from "@ssurak/db";

const baseFilter = {
  name: "filter",
  required: false,
  description: "필터 옵션",
};

const baseInclude = {
  name: "include",
  required: false,
  description: "포함할 리소스",
};

export const paramsDocs = {
  storeId: { name: "storeId", description: "매장 고유 ID" },
  tableId: { name: "tableId", description: "테이블 고유 ID" },
  menuId: { name: "menuId", description: "메뉴 고유 ID" },
  draftId: { name: "draftId", description: "메뉴 초안 고유 ID" },
  categoryId: { name: "categoryId", description: "카테고리 고유 ID" },
  optionId: { name: "optionId", description: "메뉴 옵션 고유 ID" },
  choiceId: { name: "choiceId", description: "옵션 선택지 고유 ID" },
  orderId: { name: "orderId", description: "주문 고유 ID" },
  orderItemId: { name: "orderItemId", description: "주문 항목 고유 ID" },
  ownerId: { name: "ownerId", description: "매장 소유자 고유 ID" },
  sessionId: { name: "sessionId", description: "세션 고유 ID" },
  sessionToken: { name: "sessionToken", description: "세션 토큰" },
  adminId: { name: "adminId", description: "관리자 고유 ID" },
  query: {
    filter: {
      base: baseFilter,
      orderItem: { ...baseFilter, enum: [ALIVE_SESSION] },
      session: { ...baseFilter, enum: [ALIVE_SESSION, ENDED_SESSION] },
      table: {
        ...baseFilter,
        enum: [ALIVE_SESSION, ENDED_SESSION, ACTIVATED_TABLE],
      },
    },
    include: {
      base: baseInclude,
      orders: { ...baseInclude, enum: [ORDERS] },
      orderItems: { ...baseInclude, enum: [ORDERS, ORDER_ITEMS] },
    },
  },
};
