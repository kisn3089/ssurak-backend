import { OrderNoticeMessage, OrderStatus } from "@ssurak/db";

export const ORDER_STATUS_MESSAGE_MAP: Record<OrderStatus, OrderNoticeMessage> =
  {
    [OrderStatus.PENDING]: {},
    [OrderStatus.ACCEPTED]: {
      customer: "주문이 수락되었습니다.",
    },
    [OrderStatus.PREPARING]: {
      customer: "음식이 준비 중입니다.",
    },
    [OrderStatus.COMPLETED]: {
      customer: "음식이 제공되었습니다. 맛있게 드세요 🥂",
    },
    [OrderStatus.CANCELLED]: {
      owner: "관리자가 주문을 취소하였습니다.",
      customer: "주문이 취소되었습니다.",
    },
  } as const;
