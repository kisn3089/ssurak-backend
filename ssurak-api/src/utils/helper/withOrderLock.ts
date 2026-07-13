import { Prisma } from "@ssurak/db";
import { Tx } from "./transactionPipe";

export async function withOrderLock<T>(
  tx: Tx,
  orderId: bigint,
  fn: () => Promise<T>
): Promise<T> {
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM \`order\` WHERE id = ${orderId} FOR UPDATE
  `);
  return fn();
}
