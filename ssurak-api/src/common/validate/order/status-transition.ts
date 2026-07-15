import { HttpException, HttpStatus } from "@nestjs/common";
import { Order, OrderStatus, Prisma } from "@ssurak/db";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";

type ProgressStatus = Exclude<OrderStatus, "CANCELLED">;

/** 주문 진행 순서. CANCELLED는 순서 밖 — 미취소 주문 어디서든 진입 가능. */
const ORDER_STATUS_RANK: Record<ProgressStatus, number> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.ACCEPTED]: 1,
  [OrderStatus.PREPARING]: 2,
  [OrderStatus.COMPLETED]: 3,
};

/**
 * 상태 역행과 동일 상태 중복 변경을 차단한다.
 * 앞 단계 건너뛰기(PENDING → COMPLETED 등)는 매장 운영상 허용한다.
 */
export function validateOrderStatusTransition(
  current: OrderStatus,
  next: OrderStatus
): void {
  const isForward =
    current !== OrderStatus.CANCELLED &&
    (next === OrderStatus.CANCELLED ||
      ORDER_STATUS_RANK[next as ProgressStatus] >
        ORDER_STATUS_RANK[current as ProgressStatus]);

  if (isForward) return;

  throw new HttpException(
    {
      ...exceptionContentsIs("ORDER_STATUS_INVALID_TRANSITION"),
      details: { from: current, to: next },
    },
    HttpStatus.BAD_REQUEST
  );
}

/**
 * 상태 도달 시각을 기록한다. 단계를 건너뛰어도 acceptedAt은 보정한다
 * (PREPARING/COMPLETED 진입은 수락을 전제하므로).
 */
export function buildOrderStatusTimestamps(
  order: Pick<Order, "acceptedAt">,
  next: OrderStatus
): Pick<Prisma.OrderUpdateInput, "acceptedAt" | "completedAt"> {
  if (next === OrderStatus.CANCELLED) return {};

  const now = new Date();
  return {
    ...(ORDER_STATUS_RANK[next] >= ORDER_STATUS_RANK[OrderStatus.ACCEPTED]
      ? { acceptedAt: order.acceptedAt ?? now }
      : {}),
    ...(next === OrderStatus.COMPLETED ? { completedAt: now } : {}),
  };
}
