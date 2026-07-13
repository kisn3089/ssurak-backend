import {
  aliveSessionFilter,
  ORDER_WITH_ITEMS_RECORD,
} from "./session-query.const";

export const orderSituationPayload = () => ({
  tableSessions: {
    ...aliveSessionFilter(),
    select: {
      publicId: true,
      expiresAt: true,
      orders: ORDER_WITH_ITEMS_RECORD,
    },
  },
});
