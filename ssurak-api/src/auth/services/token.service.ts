import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Injectable } from "@nestjs/common";
import { TokenPayload, User } from "@ssurak/db";

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

  /** 토큰 생성만 담당한다 — 쿠키 적용은 세션 등록이 성공한 뒤 호출부에서 처리한다. */
  generateToken(user: User, role: TokenPayload["role"]) {
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

    return {
      accessToken,
      expiresAt,
      refreshToken,
      refreshExpiresAt: expiresRefreshToken,
      tokenPayload,
    };
  }
}
