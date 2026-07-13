/**
 * 테이블 세션 상태.
 * `z.literal()` 등 런타임 값으로도 쓰이므로 const 객체로 선언한다.
 */
export const TableSessionStatus = {
  /** 세션은 생성되었지만 아직 주문이 없는 상태 */
  WAITING_ORDER: "WAITING_ORDER",
  /** 테이블이 활성화되어 주문이 가능한 상태 */
  ACTIVE: "ACTIVE",
  /** 결제 대기 중인 상태 */
  PAYMENT_PENDING: "PAYMENT_PENDING",
  /** 결제 완료 또는 만료로 종료된 상태 */
  CLOSED: "CLOSED",
} as const;

export type TableSessionStatus =
  (typeof TableSessionStatus)[keyof typeof TableSessionStatus];

/** 테이블 세션 응답. 기본 세션 시간은 2시간이며 연장하는 방식으로 운영한다. */
export interface TableSession {
  publicId: string;
  status: TableSessionStatus;
  sessionToken: string;
  activatedAt: string;
  expiresAt: string;
  closedAt: string | null;
  paidAmount: number;
  createdAt: string;
  updatedAt: string;
}
