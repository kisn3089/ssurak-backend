import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { COOKIE_TABLE, TableSession, TokenPayload } from "@ssurak/db";
import { sessionTokenSchema } from "@ssurak/schema";
import { ALIVE_SESSION_STATUSES } from "src/common/query/session-query.const";
import { PrismaService } from "src/prisma/prisma.service";
import { AuthService } from "src/auth/services/auth.service";

export type AdminPrincipal = {
  kind: "admin";
  userId: bigint;
  role: TokenPayload["role"];
};

export type CustomerPrincipal = {
  kind: "customer";
  session: TableSession;
  storePublicId: string;
  tablePublicId: string;
};

export type RealtimePrincipal = AdminPrincipal | CustomerPrincipal;

export const parseCookies = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .reduce<Record<string, string>>((acc, part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx < 0) return acc;
      const key = part.slice(0, eqIdx).trim();
      const value = decodeURIComponent(part.slice(eqIdx + 1).trim());
      if (key) acc[key] = value;
      return acc;
    }, {});
};

@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async verifyAdmin(
    cookies: Record<string, string>
  ): Promise<AdminPrincipal | null> {
    const token = cookies[COOKIE_TABLE.ACCESS_TOKEN];
    if (!token) return null;

    try {
      const payload = this.jwt.verify<TokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_TOKEN_SECRET"),
      });

      const user = await this.authService.findUserByRole({
        role: payload.role,
        sub: payload.sub,
      });

      return { kind: "admin", userId: user.id, role: payload.role };
    } catch {
      return null;
    }
  }

  async verifyCustomer(
    cookies: Record<string, string>
  ): Promise<CustomerPrincipal | null> {
    const raw = cookies[COOKIE_TABLE.SESSION_TOKEN];
    const parsed = sessionTokenSchema.safeParse(raw);
    if (!parsed.success) return null;

    const session = await this.prisma.tableSession.findFirst({
      where: {
        sessionToken: parsed.data,
        expiresAt: { gt: new Date() },
        status: { in: ALIVE_SESSION_STATUSES },
      },
      include: {
        table: { include: { store: { select: { publicId: true } } } },
      },
    });

    if (!session) return null;

    return {
      kind: "customer",
      session,
      storePublicId: session.table.store.publicId,
      tablePublicId: session.table.publicId,
    };
  }

  async ownsStore(userId: bigint, storePublicId: string): Promise<boolean> {
    const store = await this.prisma.store.findFirst({
      where: { publicId: storePublicId, ownerId: userId },
      select: { id: true },
    });
    return store !== null;
  }
}
