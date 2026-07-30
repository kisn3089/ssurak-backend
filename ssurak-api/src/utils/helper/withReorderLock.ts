import { HttpException, HttpStatus } from "@nestjs/common";
import { Prisma } from "@ssurak/db";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { Tx } from "./transactionPipe";

const LOCK_TIMEOUT_SECONDS = 3;

/** 재번호 쿼리에 남겨둘 시간. Prisma 인터랙티브 트랜잭션 기본 예산과 같다. */
const WORK_BUDGET_MS = 5_000;

/**
 * 재정렬 트랜잭션에 줄 timeout. 락 대기가 트랜잭션 예산 안에서 소모되므로 기본값
 * 5초를 그대로 쓰면 3초를 기다린 요청에 2초만 남는다 — 그 상태로 넘기면 P2028이 나고,
 * 의도한 409 대신 400(PRISMA_ERROR)으로 응답이 바뀐다.
 */
export const REORDER_TX_TIMEOUT_MS =
  LOCK_TIMEOUT_SECONDS * 1000 + WORK_BUDGET_MS;

/**
 * 매장별 재정렬을 직렬화한다.
 * store 행을 FOR UPDATE로 잡지 않는 이유: 그 행은 order·table·category의 FK 부모라,
 * 자식 INSERT가 부모 행에 S락을 요구하면서 X락에 막힌다 — 정렬과 무관한 고객 주문 생성이
 * 재정렬 트랜잭션을 기다리게 된다. 어드바이저리 락은 이름만 잠그므로 그 부작용이 없다.
 * 키가 매장별이라 다른 매장의 재정렬끼리도 서로 막지 않는다.
 *
 * GET_LOCK은 트랜잭션이 아니라 **커넥션**에 묶인다. 풀에서 다른 커넥션을 잡으면
 * RELEASE_LOCK이 아무것도 풀지 못해 락이 커넥션 수명만큼 남고 이후 재정렬이 전부 막히므로,
 * 커넥션이 고정되는 인터랙티브 트랜잭션 안에서만 획득·해제한다.
 *
 * 해제 시점은 COMMIT 직전이다. 그 틈에 다른 재정렬이 들어와도 재번호 UPDATE는 요청 payload로만
 * 결정되는 blind write라 최종 상태는 나중 요청의 순서가 된다 — 두 요청이 섞이지는 않는다.
 */
export async function withReorderLock<T>(
  tx: Tx,
  storePublicId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockName = `reorder:${storePublicId}`;

  const [lock] = await tx.$queryRaw<{ acquired: number | null }[]>(Prisma.sql`
    SELECT GET_LOCK(${lockName}, ${LOCK_TIMEOUT_SECONDS}) AS acquired
  `);

  // 1 = 획득, 0 = 타임아웃(다른 재정렬 진행 중), NULL = 에러.
  if (Number(lock?.acquired) !== 1) {
    throw new HttpException(
      exceptionContentsIs("REORDER_IN_PROGRESS"),
      HttpStatus.CONFLICT
    );
  }

  try {
    return await fn();
  } finally {
    await tx.$queryRaw(Prisma.sql`SELECT RELEASE_LOCK(${lockName})`);
  }
}
