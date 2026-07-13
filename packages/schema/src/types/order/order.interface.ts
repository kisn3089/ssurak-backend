import type { OrderItem } from "../orderItem/orderItem.interface";

/**
 * 주문 상태.
 * `z.literal()`·`nextStatusMap` 등 런타임 값으로도 쓰이므로 const 객체로 선언한다.
 */
export const OrderStatus = {
  /** 주문을 접수하기 전 상태 (기본값) */
  PENDING: "PENDING",
  /** 주문을 수락해 조리에 들어가기 직전 상태 */
  ACCEPTED: "ACCEPTED",
  /** 조리가 진행 중인 상태 */
  PREPARING: "PREPARING",
  /** 조리가 완료되어 픽업·서빙까지 마친 상태 */
  COMPLETED: "COMPLETED",
  /** 주문이 취소된 상태. 복구할 수 없다. */
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * 주문 응답.
 * 서버는 `id`·`storeId`·`tableId`·`tableSessionId`와 관계 필드를 제외하고 내려준다.
 */
export interface Order {
  publicId: string;
  /** 고객 주문 멱등성 키. 관리자 주문은 사용하지 않아 nullable. */
  idempotencyKey: string | null;
  status: OrderStatus;
  /** 메뉴별 요청사항과 별개로 고객이 주문 전체에 남기는 요청사항 */
  memo: string | null;
  cancelledReason: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 주문 + 주문 항목 응답. */
export type OrderWithItemsResponse = Order & {
  orderItems: OrderItem[];
};
