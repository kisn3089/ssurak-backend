import { Prisma } from "@ssurak/db";
import { Tx } from "src/utils/helper/transactionPipe";

/** 표시용 주문번호의 순번 자릿수. "A-0001". */
export const ORDER_SEQ_PAD_LENGTH = 4;

/**
 * 같은 순번을 동시에 집어 unique에 걸렸을 때의 재시도 횟수.
 * 매장 하나에 동시 주문이 몰려도 몇 건 수준이라 이 정도면 수렴한다.
 */
export const ORDER_SEQ_MAX_RETRY = 3;

export function formatOrderNumber(prefix: string, orderSeq: number): string {
  return `${prefix}-${String(orderSeq).padStart(ORDER_SEQ_PAD_LENGTH, "0")}`;
}

export async function nextOrderSeq(
  tx: Tx,
  storeId: bigint,
  businessDate: string
): Promise<number> {
  const last = await tx.order.findFirst({
    where: { storeId, businessDate },
    orderBy: { orderSeq: "desc" },
    select: { orderSeq: true },
  });

  return (last?.orderSeq ?? 0) + 1;
}

function conflictTargetText(
  error: Prisma.PrismaClientKnownRequestError
): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(",");

  return typeof target === "string" ? target : "";
}

/** P2002가 주문번호 순번 때문인지. 멱등키 충돌과 구분해야 처리가 갈린다. */
export function isOrderSeqConflict(
  error: Prisma.PrismaClientKnownRequestError
): boolean {
  return conflictTargetText(error).includes("order_seq");
}

/** P2002가 멱등키 때문인지. */
export function isIdempotencyKeyConflict(
  error: Prisma.PrismaClientKnownRequestError
): boolean {
  return conflictTargetText(error).includes("idempotency");
}
