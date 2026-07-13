import { Injectable } from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { AccessGuard, AccessResult } from "./access.guard";

@Injectable()
export class OwnerAccessGuard extends AccessGuard {
  protected proofCanAccess(
    user: PrivateRequestUser,
    params: Record<string, string>
  ): AccessResult {
    const userId = user.info.publicId;
    const ownerIdByParam = params.ownerId;

    return userId === ownerIdByParam ? "GRANTED" : "FORBIDDEN";
  }
}
