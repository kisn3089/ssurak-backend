import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrivateRequestUser } from "@ssurak/db";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";

export interface JwtErrorInfo {
  name?: "TokenExpiredError" | "Error" | "NotBeforeError";
  message?: string;
  expiredAt?: Date;
}

/**
 * JWT 인증 가드로써 통과한다면 아래 데코레이터를 사용할 수 있다.
 * @access `@Client` Admin | Owner 정보를 주입
 * @access `@Jwt` JWT 정보를 주입 [TokenPayload]
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  /**
   * JWT 검증 결과를 처리하는 메서드
   * @param err - JWT 검증 중 발생한 에러
   * @param user - JwtStrategy.validate()의 반환값
   * @param info - Passport가 제공하는 추가 정보 (TokenExpiredError, JsonWebTokenError 등)
   * @param context - 실행 컨텍스트
   * @param status - HTTP 상태 코드 (선택사항)
   */
  handleRequest<User = PrivateRequestUser>(
    err: unknown,
    user: User,
    info: JwtErrorInfo
  ): User {
    if (err || !user) {
      // [TODO:] 로깅 서비스로 변경 필요
      console.warn("user: ", user);
      console.warn("error: ", err instanceof Error ? err.message : undefined);
      console.warn("info: ", info?.name);
      console.warn("timestamp: ", new Date().toISOString());
    }

    if (info?.name === "TokenExpiredError") {
      throw new HttpException(exceptionContentsIs("UNAUTHORIZED"), 419);
    }

    if (err) throw err;

    if (!user) {
      throw new HttpException(
        exceptionContentsIs("UNAUTHORIZED"),
        HttpStatus.UNAUTHORIZED
      );
    }

    return user;
  }
}
