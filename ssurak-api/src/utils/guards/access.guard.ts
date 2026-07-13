import { Request } from "express";
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { PrivateRequestUser } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";

type RequestWithClient = Request<Record<string, string>> & {
  user: PrivateRequestUser;
};

export type AccessResult = "GRANTED" | "FORBIDDEN" | "NOT_FOUND";

@Injectable()
export abstract class AccessGuard implements CanActivate {
  constructor(protected prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClient>();

    if (!request.user) {
      throw new HttpException(
        exceptionContentsIs("UNAUTHORIZED"),
        HttpStatus.UNAUTHORIZED
      );
    }

    const result = await this.proofCanAccess(request.user, request.params);

    if (result === "NOT_FOUND") {
      throw new HttpException(
        exceptionContentsIs("NOT_FOUND"),
        HttpStatus.NOT_FOUND
      );
    }
    if (result === "FORBIDDEN") {
      throw new HttpException(
        exceptionContentsIs("FORBIDDEN"),
        HttpStatus.FORBIDDEN
      );
    }
    return true;
  }

  protected abstract proofCanAccess(
    user: PrivateRequestUser,
    params: Record<string, string>
  ): Promise<AccessResult> | AccessResult;

  /**
   * 리소스 존재 여부와 소유 여부를 구분해 접근 결과로 변환한다.
   * - 리소스 없음 → NOT_FOUND
   * - 소유자 불일치 → FORBIDDEN
   * - 소유자 일치 → GRANTED
   */
  protected resolveAccess<T>(
    resource: T | null,
    isOwner: (resource: T) => boolean
  ): AccessResult {
    if (!resource) {
      return "NOT_FOUND";
    }
    return isOwner(resource) ? "GRANTED" : "FORBIDDEN";
  }
}
