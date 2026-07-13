import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService } from "../services/auth.service";
import { COOKIE_TABLE } from "@ssurak/db/constants";
import { PrivateRequestUser, TokenPayload } from "@ssurak/db";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh"
) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request.cookies?.[COOKIE_TABLE.REFRESH],
      ]),
      secretOrKey: configService.getOrThrow<string>("JWT_REFRESH_TOKEN_SECRET"),
      passReqToCallback: true,
    });
  }

  async validate(
    request: Request,
    payload: TokenPayload
  ): Promise<PrivateRequestUser | null> {
    const refreshToken: string | null | undefined =
      request.cookies?.[COOKIE_TABLE.REFRESH];

    if (!refreshToken) return null;

    const user = await this.authService.validateRefreshToken(
      refreshToken,
      payload
    );

    return { info: user, jwt: payload };
  }
}
