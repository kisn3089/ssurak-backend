import { Injectable } from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { AccessGuard, AccessResult } from "./access.guard";
import { isAdmin } from "../isAdmin";

/**
 * 대상 리소스 없이 역할만 검사한다.
 * AdminAccessGuard는 `:adminId`와 본인 여부를 대조하므로, 아직 대상 id가 없는
 * 생성 요청(POST /identity/v1/owners)에는 쓸 수 없다.
 */
@Injectable()
export class AdminRoleGuard extends AccessGuard {
  protected proofCanAccess(user: PrivateRequestUser): AccessResult {
    return isAdmin(user.jwt.role) ? "GRANTED" : "FORBIDDEN";
  }
}
