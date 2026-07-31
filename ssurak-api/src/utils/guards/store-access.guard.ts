import { Injectable } from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { AccessGuard, AccessResult } from "./access.guard";
import { isAdmin } from "../isAdmin";

@Injectable()
export class StoreAccessGuard extends AccessGuard {
  protected async proofCanAccess(
    user: PrivateRequestUser,
    params: Record<string, string>
  ): Promise<AccessResult> {
    const { jwt } = user;

    /** admin은 매장 소유자가 아니다. */
    if (isAdmin(jwt.role)) {
      return "FORBIDDEN";
    }

    const ownerId = user.info.id;
    const storeId = params.storeId;

    const store = await this.prisma.store.findFirst({
      where: { publicId: storeId },
      select: { ownerId: true },
    });

    return this.resolveAccess(store, (s) => s.ownerId === ownerId);
  }
}
