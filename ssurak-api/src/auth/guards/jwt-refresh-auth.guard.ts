import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PublicUser } from "@ssurak/db";
import { JwtErrorInfo } from "./jwt-auth.guard";
import { Response } from "express";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { COOKIE_TABLE } from "@ssurak/db/constants";

@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard("jwt-refresh") {
  handleRequest<User = PublicUser>(
    err: unknown,
    user: User,
    info: JwtErrorInfo,
    context: ExecutionContext
  ): User {
    if (err || !user) {
      console.warn("-------refresh token guard-------");
      console.warn("user: ", user);
      console.warn("error: ", err instanceof Error ? err.message : undefined);
      console.warn("info: ", info?.name);
      console.warn("info: ", info?.message);
      console.warn("timestamp: ", new Date().toISOString());
    }

    if (err) throw err;

    if (!user) {
      const response = context.switchToHttp().getResponse<Response>();
      response.clearCookie(COOKIE_TABLE.REFRESH as string);
      throw new HttpException(
        exceptionContentsIs("REFRESH_FAILED"),
        HttpStatus.UNAUTHORIZED
      );
    }

    return user;
  }
}
