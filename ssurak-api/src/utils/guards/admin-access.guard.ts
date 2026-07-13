import { Injectable } from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { AccessGuard, AccessResult } from "./access.guard";

@Injectable()
export class AdminAccessGuard extends AccessGuard {
  protected proofCanAccess(
    user: PrivateRequestUser,
    params: Record<string, string>
  ): AccessResult {
    const userId = user.info.publicId;
    const adminIdByParam = params.adminId;

    const canAccess = userId === adminIdByParam && user.jwt.role === "admin";
    return canAccess ? "GRANTED" : "FORBIDDEN";
  }
}

/** TODO: 추후 Admin Super Guard, Viewer Guard 등 추가 구현 */
