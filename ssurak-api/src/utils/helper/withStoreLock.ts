import { Prisma } from "@ssurak/db";
import { Tx } from "./transactionPipe";

/**
 * 매장 행을 뮤텍스로 잡는다. 카테고리·메뉴 정렬은 "현재 순서를 읽고 → 다시 매긴다"라
 * read-modify-write이므로, 락이 없으면 동시 요청이 서로의 재번호를 덮어쓴다.
 * 정렬 대상(카테고리/메뉴)이 아니라 공통 부모인 store를 잠가야 두 재정렬이 직렬화된다.
 */
export async function withStoreLock<T>(
  tx: Tx,
  storePublicId: string,
  fn: () => Promise<T>
): Promise<T> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM \`store\` WHERE public_id = ${storePublicId} FOR UPDATE
  `);
  return fn();
}
