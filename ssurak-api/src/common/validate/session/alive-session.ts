import { HttpStatus, HttpException } from "@nestjs/common";
import { TableSession } from "@ssurak/db";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";

export function isActivateTableOrThrow(isActive: boolean): void {
  if (!isActive) {
    throw new HttpException(
      exceptionContentsIs("TABLE_INACTIVE"),
      HttpStatus.FORBIDDEN
    );
  }
}

export function isSessionExpired(
  session: Pick<TableSession, "expiresAt">
): boolean {
  return session.expiresAt < new Date();
}
