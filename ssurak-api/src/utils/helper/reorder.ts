import { HttpException, HttpStatus } from "@nestjs/common";
import { Prisma } from "@ssurak/db";
import {
  ExceptionContentKeys,
  exceptionContentsIs,
} from "src/common/constants/exceptionContents";
import { Tx } from "./transactionPipe";

export const SORT_ORDER_STEP = 10;

export function assertSameSet(
  currentIds: string[],
  requestedIds: string[],
  mismatchKey: ExceptionContentKeys
): void {
  const current = new Set(currentIds);
  const sameSize = current.size === requestedIds.length;

  if (!sameSize || !requestedIds.every((id) => current.has(id))) {
    throw new HttpException(
      exceptionContentsIs(mismatchKey),
      HttpStatus.CONFLICT
    );
  }
}

export async function renumberSortOrder(
  tx: Tx,
  table: "category" | "menu",
  orderedPublicIds: string[]
): Promise<void> {
  const cases = Prisma.join(
    orderedPublicIds.map(
      (publicId, index) =>
        Prisma.sql`WHEN ${publicId} THEN ${(index + 1) * SORT_ORDER_STEP}`
    ),
    " "
  );

  const tableName = Prisma.raw(`\`${table}\``);

  await tx.$executeRaw(Prisma.sql`
    UPDATE ${tableName}
    SET sort_order = CASE public_id ${cases} END
    WHERE public_id IN (${Prisma.join(orderedPublicIds)})
  `);
}
