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

    responseCookie.set(response, COOKIE_TABLE.ACCESS_TOKEN, accessToken, {
      expires: expiresRefreshToken,
    });

    return { accessToken, expiresAt, refreshToken, tokenPayload };
  }
}
