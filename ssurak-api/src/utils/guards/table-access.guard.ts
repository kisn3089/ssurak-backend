import { Injectable } from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { AccessGuard, AccessResult } from "./access.guard";

@Injectable()
export class TableAccessGuard extends AccessGuard {
  protected async proofCanAccess(
    user: PrivateRequestUser,
    params: Record<string, string>
  ): Promise<AccessResult> {
    const ownerId = user.info.id;
    const tableId = params.tableId;

    const table = await this.prisma.table.findFirst({
      where: { publicId: tableId },
      select: { store: { select: { ownerId: true } } },
    });

    return this.resolveAccess(table, (t) => t.store.ownerId === ownerId);
  }
}
