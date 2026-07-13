import { Request } from "express";
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { sessionTokenSchema } from "@ssurak/schema";
import { COOKIE_TABLE, SessionWithTable } from "@ssurak/db";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { PrismaService } from "src/prisma/prisma.service";
import { ALIVE_SESSION_STATUSES } from "src/common/query/session-query.const";

type RequestWithClient = Request & {
  session: SessionWithTable | null;
};
/**
 * @access Session
 * @type SessionWithTable
 * @description Guard to check permission to access the session and cache the result.
 */
@Injectable()
export class SessionAuth implements CanActivate {
  constructor(private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithClient>();
    const sessionToken = request.cookies?.[COOKIE_TABLE.SESSION_TOKEN];

    const tokenValidation = sessionTokenSchema.safeParse(sessionToken);

    if (tokenValidation.success) {
      const activeSession = await this.prismaService.tableSession.findFirst({
        where: {
          sessionToken: tokenValidation.data,
          expiresAt: { gt: new Date() },
          status: { in: ALIVE_SESSION_STATUSES },
        },
        include: {
          table: { include: { store: { select: { publicId: true } } } },
        },
      });

      if (activeSession) {
        request.session = activeSession;
        return true;
      }
    }

    throw new HttpException(
      exceptionContentsIs("INVALID_TABLE_SESSION"),
      HttpStatus.UNAUTHORIZED
    );
  }
}
