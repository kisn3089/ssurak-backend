import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Injectable } from "@nestjs/common";
import { PrivateRequestUser, TokenPayload } from "@ssurak/db";
import { AuthService } from "../services/auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>("JWT_ACCESS_TOKEN_SECRET"),
    });
  }

  async validate(jwt: TokenPayload): Promise<PrivateRequestUser> {
    const user = await this.authService.findUserByRole({
      role: jwt.role,
      where: { publicId: jwt.sub },
    });

    return { info: user, jwt };
  }
}
