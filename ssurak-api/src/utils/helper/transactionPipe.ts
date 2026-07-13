import type { Prisma, PrismaClient } from "@ssurak/db";

export type Tx = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

type TransactionPipe = (tx?: Tx) => Promise<void>;

export const transactionPipe = async (tx: Tx, ...args: TransactionPipe[]) => {
  for (const func of args) {
    await func(tx);
  }
};
