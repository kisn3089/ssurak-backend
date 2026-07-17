import { createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { TokenPayload } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";

/** 계정당 동시에 유지할 수 있는 인증 세션(로그인 기기) 수 */
const MAX_ACTIVE_TOKENS = 5;

/**
 * 로그인(기기)별 인증 세션 관리.
 * 계정당 여러 세션을 허용해 새 로그인이 다른 기기의 세션을 끊지 않는다.
 * refresh token 원문은 저장하지 않으므로 기존 토큰을 재발급 없이
 * 돌려주는 것은 불가능하다 — 로그인마다 새 토큰을 추가 발급한다.
 *
 * 해시는 bcrypt가 아닌 SHA-256을 쓴다. bcrypt는 입력을 72바이트로 절단해
 * 같은 유저의 JWT들(앞부분이 동일)이 전부 서로 매치되고, 저엔트로피
 * 비밀번호용 느린 해시가 고엔트로피 토큰에는 불필요하다. 정확 일치
 * 쿼리가 가능해져 소비(삭제)도 원자적으로 처리된다.
 */
@Injectable()
export class AuthSessionService {
  constructor(private readonly prismaService: PrismaService) {}

  private readonly logger = new Logger(AuthSessionService.name);

  private hashToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }

  /** 새 refresh token을 등록하고, 만료분과 상한 초과분(오래된 순)을 정리한다. */
  async register(
    role: TokenPayload["role"],
    userId: bigint,
    refreshToken: string,
    expiresAt: Date
  ): Promise<void> {
    await this.prismaService.authSession.create({
      data: {
        role,
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    // 정리는 best-effort — 트랜잭션으로 묶으면 deleteMany의 gap lock이
    // 동시 로그인 insert와 데드락을 일으킬 수 있고, 실패해도 로그인엔 영향 없다
    await this.pruneTokens(role, userId).catch((error) =>
      this.logger.error(
        `세션 정리 실패 (role=${role}, userId=${userId}): ${error}`
      )
    );
  }

  private async pruneTokens(
    role: TokenPayload["role"],
    userId: bigint
  ): Promise<void> {
    await this.prismaService.authSession.deleteMany({
      where: { role, userId, expiresAt: { lte: new Date() } },
    });

    const overflow = await this.prismaService.authSession.findMany({
      where: { role, userId },
      orderBy: { id: "desc" },
      skip: MAX_ACTIVE_TOKENS,
      select: { id: true },
    });

    if (overflow.length > 0) {
      await this.prismaService.authSession.deleteMany({
        where: { id: { in: overflow.map((token) => token.id) } },
      });
    }
  }

  /**
   * 제시된 refresh token과 일치하는 활성 토큰을 소비(삭제)한다.
   * 삭제가 곧 검증이므로 동시 요청이 와도 한 번만 성공하고,
   * 직후 새 토큰이 발급되므로(rotation) 같은 토큰의 재사용을 차단한다.
   */
  async consume(
    role: TokenPayload["role"],
    userId: bigint,
    refreshToken: string
  ): Promise<boolean> {
    const { count } = await this.prismaService.authSession.deleteMany({
      where: {
        role,
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: { gt: new Date() },
      },
    });

    return count > 0;
  }
}
