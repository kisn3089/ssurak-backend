import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Response } from "express";
import { Prisma, TokenPayload, User } from "@ssurak/db";
import { comparePlainToEncrypted } from "src/utils/lib/crypt";
import type { AccessToken, SignInPayload } from "@ssurak/schema";
import { TokenService } from "./token.service";
import { AuthSessionService } from "./auth-session.service";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { OwnerService } from "src/identity/owner/owner.service";
import { AdminService } from "src/identity/admin/admin.service";

type FindUserByRoleParams =
  | { role: "owner"; where: Prisma.OwnerWhereInput }
  | { role: "admin"; where: Prisma.AdminWhereInput };

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
      this.tokenService.generateToken(user, response, role);

    // 로그인마다 새 토큰을 추가 등록한다 — 다른 기기의 세션은 유지된다
    await this.authSessionService.register(
      role,
      user.id,
      refreshToken,
      refreshExpiresAt
    );
    await this.updateLastSignInByRole(role, user.publicId);

    return { accessToken, expiresAt };
  }

  async validateRefreshToken(
    refreshToken: string,
    { role, sub }: TokenPayload
  ): Promise<User> {
    const user = await this.findUserByRole({ role, where: { publicId: sub } });

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

  async findUserByRole({ role, where }: FindUserByRoleParams): Promise<User> {
    try {
      switch (role) {
        case "owner": {
          return await this.ownerService.getUnique({ where });
        }

        case "admin":
          return await this.adminService.getUnique({ where });
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
      const user = await this.findUserByRole({ role, where: { email } });

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
