import { Injectable } from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { AccessGuard, AccessResult } from "./access.guard";

@Injectable()
export class OrderItemAccessGuard extends AccessGuard {
  protected async proofCanAccess(
    user: PrivateRequestUser,
    params: Record<string, string>
  ): Promise<AccessResult> {
    const ownerId = user.info.id;
    const orderItemId = params.orderItemId;

    const orderItem = await this.prisma.orderItem.findFirst({
      where: { publicId: orderItemId },
      select: { order: { select: { store: { select: { ownerId: true } } } } },
    });

    return this.resolveAccess(
      orderItem,
      (oi) => oi.order.store.ownerId === ownerId
    );
  }
}
