import { Injectable } from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { AccessGuard, AccessResult } from "./access.guard";

@Injectable()
export class OrderAccessGuard extends AccessGuard {
  protected async proofCanAccess(
    user: PrivateRequestUser,
    params: Record<string, string>
  ): Promise<AccessResult> {
    const ownerId = user.info.id;
    const orderId = params.orderId;

    const order = await this.prisma.order.findFirst({
      where: { publicId: orderId },
      select: { store: { select: { ownerId: true } } },
    });

    return this.resolveAccess(order, (o) => o.store.ownerId === ownerId);
  }
}
