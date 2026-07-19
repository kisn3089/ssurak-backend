import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Response } from "express";
import { Prisma, TokenPayload, User } from "@ssurak/db";
import { COOKIE_TABLE } from "@ssurak/db/constants";
import { responseCookie } from "src/utils/cookies";
import { comparePlainToEncrypted } from "src/utils/lib/crypt";
import type { AccessToken, SignInPayload } from "@ssurak/schema";
import { TokenService } from "./token.service";
import { AuthSessionService } from "./auth-session.service";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { OwnerService } from "src/identity/owner/owner.service";
import { AdminService } from "src/identity/admin/admin.service";

type FindUserByRoleParams = { role: TokenPayload["role"] } & (
  { sub: string; email?: never } | { sub?: never; email: string }
);

@Injectable()
export class AuthService {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authSessionService: AuthSessionService,
    private readonly ownerService: OwnerService,
    private readonly adminService: AdminService
  ) {}

  async createToken(
    user: User,
    response: Response,
    role: TokenPayload["role"]
  ): Promise<AccessToken> {
    const { accessToken, expiresAt, refreshToken, refreshExpiresAt } =
      this.tokenService.generateToken(user, role);

    // 로그인마다 새 토큰을 추가 등록한다 — 다른 기기의 세션은 유지된다
    await this.authSessionService.register(
      role,
      user.id,
      refreshToken,
      refreshExpiresAt
    );
    await this.updateLastSignInByRole(role, user.publicId);

    // 쿠키는 DB 작업이 모두 성공한 뒤에 설정한다 — 중간에 실패하면
    // 오류 응답에 Set-Cookie가 실려 미등록 토큰이 클라이언트에 남는다
    responseCookie.set(response, COOKIE_TABLE.REFRESH, refreshToken, {
      expires: refreshExpiresAt,
    });

    // access 쿠키는 refresh 만료까지 유지한다. JWT 만료와 맞추면 만료 시점에
    // 쿠키가 사라져 요청에 토큰이 아예 실리지 않고, 서버가 419(만료) 대신
    // 401을 응답해 클라이언트 인터셉터의 자동 갱신이 동작하지 않는다.
    responseCookie.set(response, COOKIE_TABLE.ACCESS_TOKEN, accessToken, {
      expires: refreshExpiresAt,
    });

    return { accessToken, expiresAt };
  }

  async validateRefreshToken(
    refreshToken: string,
    { role, sub }: TokenPayload
  ): Promise<User> {
    const user = await this.findUserByRole({ role, sub });

    // 일치한 토큰은 소비되고 곧바로 새 토큰이 발급된다(rotation)
    const authenticated = await this.authSessionService.consume(
      role,
      user.id,
      refreshToken
    );

    if (!authenticated) {
      throw new HttpException(
        exceptionContentsIs("REFRESH_FAILED"),
        HttpStatus.UNAUTHORIZED
      );
    }
    return user;
  }

  async findUserByRole({
    role,
    sub,
    email,
  }: FindUserByRoleParams): Promise<User> {
    try {
      switch (role) {
        case "owner": {
          return await this.ownerService.getOwnerUniqueAllInclude(sub, email);
        }

        case "admin":
          return await this.adminService.getAdminUniqueAllInclude(sub, email);
        default:
          throw new HttpException(
            exceptionContentsIs("INVALID_ROLE"),
            HttpStatus.BAD_REQUEST
          );
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new UnauthorizedException(exceptionContentsIs("UNAUTHORIZED"));
      }
      throw error;
    }
  }

  private async updateLastSignInByRole(
    role: TokenPayload["role"],
    publicId: string
  ) {
    switch (role) {
      case "owner":
        return await this.ownerService.updateLastSignIn(publicId);
      case "admin":
        return await this.adminService.updateLastSignIn(publicId);
      default:
        throw new HttpException(
          exceptionContentsIs("INVALID_ROLE"),
          HttpStatus.BAD_REQUEST
        );
    }
  }

  async validateSignInPayload(
    { email, password }: SignInPayload,
    role: TokenPayload["role"]
  ): Promise<User> {
    try {
      const user = await this.findUserByRole({ role, email });

      const isCorrectPassword = await comparePlainToEncrypted(
        password,
        user.password
      );

      if (!isCorrectPassword) {
        throw new UnauthorizedException("INVALID PASSWORD");
      }

      return user;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw new HttpException(
          exceptionContentsIs("SIGNIN_FAILED"),
          HttpStatus.UNAUTHORIZED
        );
      }
      throw error;
    }
  }
}
