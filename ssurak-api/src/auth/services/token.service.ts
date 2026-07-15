import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Response } from "express";
import { Injectable } from "@nestjs/common";
import { TokenPayload, User } from "@ssurak/db";
import { COOKIE_TABLE } from "@ssurak/db/constants";
import { responseCookie } from "src/utils/cookies";

@Injectable()
export class TokenService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService
  ) {}

  private createTokenHelper(expirationConfigName: string) {
    const expiresTimes = parseInt(
      this.configService.getOrThrow<string>(expirationConfigName)
    );
    return {
      jwt: (baseTokenPayload: TokenPayload, jwtConfigName: string) => {
        const accessToken = this.jwtService.sign(baseTokenPayload, {
          secret: this.configService.getOrThrow<string>(jwtConfigName),
          expiresIn: `${expiresTimes}ms`,
        });
        return accessToken;
      },
      expiresAt: () => new Date(Date.now() + expiresTimes),
    };
  }

  generateToken(user: User, response: Response, role: TokenPayload["role"]) {
    const tokenPayload: TokenPayload = {
      sub: user.publicId.toString(),
      email: user.email,
      username: user.name,
      role,
      iss: this.configService.get("JWT_ISSUER"),
      aud: this.configService.get("JWT_AUDIENCE"),
      typ: `Bearer`,
      // 같은 초에 발급돼도 토큰 문자열이 유일하도록 보장 (rotation 전제 조건)
      jti: randomUUID(),
    };

    const expiresAt = this.createTokenHelper(
      "JWT_ACCESS_TOKEN_EXPIRATION_MS"
    ).expiresAt();

    const accessToken = this.createTokenHelper(
      "JWT_ACCESS_TOKEN_EXPIRATION_MS"
    ).jwt(tokenPayload, "JWT_ACCESS_TOKEN_SECRET");

    const expiresRefreshToken = this.createTokenHelper(
      "JWT_REFRESH_TOKEN_EXPIRATION_MS"
    ).expiresAt();

    const refreshToken = this.createTokenHelper(
      "JWT_REFRESH_TOKEN_EXPIRATION_MS"
    ).jwt(tokenPayload, "JWT_REFRESH_TOKEN_SECRET");

    responseCookie.set(response, COOKIE_TABLE.REFRESH, refreshToken, {
      expires: expiresRefreshToken,
    });

    // access 쿠키는 refresh 만료까지 유지한다. JWT 만료와 맞추면 만료 시점에
    // 쿠키가 사라져 요청에 토큰이 아예 실리지 않고, 서버가 419(만료) 대신
    // 401을 응답해 클라이언트 인터셉터의 자동 갱신이 동작하지 않는다.
    responseCookie.set(response, COOKIE_TABLE.ACCESS_TOKEN, accessToken, {
      expires: expiresRefreshToken,
    });

    return {
      accessToken,
      expiresAt,
      refreshToken,
      refreshExpiresAt: expiresRefreshToken,
      tokenPayload,
    };
  }
}
