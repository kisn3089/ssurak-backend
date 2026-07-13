import type { Request } from "express";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";
import { User } from "@ssurak/db";
import { AuthService } from "../services/auth.service";

type UserType = "owner" | "admin";

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  /**
   * email과 password를 검증하는 메서드 [default: username, password]
   * passReqToCallback: true로 설정하면 validate 메서드에 request 객체가 전달됨
   */
  constructor(private readonly authService: AuthService) {
    super({ usernameField: "email", passReqToCallback: true });
  }

  /**
   * validate는 예약어이며 개별 파라미터로 받기 때문에 구조 분해 X, 변수명 변경 X
   */
  async validate(
    req: Request,
    email: string,
    password: string
  ): Promise<{ info: User | undefined }> {
    const path = req.path;
    const userType = this.extractUserTypeByUrl(path);

    if (!userType) {
      throw new UnauthorizedException("유효하지 않은 로그인 경로입니다.");
    }

    const user = await this.authService.validateSignInPayload(
      { email, password },
      userType
    );
    if (user) {
      return { info: user };
    }

    throw new UnauthorizedException();
  }

  extractUserTypeByUrl(url: string): UserType | null {
    if (url.includes("/owner/")) {
      return "owner";
    }
    if (url.includes("/admin/")) {
      return "admin";
    }
    return null;
  }
}
