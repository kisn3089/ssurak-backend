import { Injectable } from "@nestjs/common";
import {
  TableSession,
  TableSessionStatus,
  PublicSession,
  SessionWithTable,
} from "@ssurak/db";
import { Tx } from "src/utils/helper/transactionPipe";
import {
  SessionCoreService,
  SessionIdentifier,
} from "../services/session-core.service";

export type SessionActivatePayload = {
  paidAmount?: number;
};

/**
 * Session 도메인과의 통신을 담당하는 클라이언트
 *
 * 현재: SessionCoreService 직접 호출 (모놀리식)
 * MSA 전환 시: HTTP 호출로 구현체 교체
 *
 * @example MSA 전환 시
 * ```typescript
 * async activateSession(tableId: string): Promise<SessionWithTable> {
 *   return this.http.post('http://session-service/internal/v1/sessions/activate', { tableId });
 * }
 * ```
 */
@Injectable()
export class SessionClient {
  constructor(private readonly sessionCore: SessionCoreService) {}

  /**
   * 트랜잭션 내에서 활성 세션을 조회하거나 새로 생성
   */
  async txGetOrCreateSession(
    tx: Tx,
    identifier: SessionIdentifier
  ): Promise<SessionWithTable> {
    return await this.sessionCore.txGetActivatedSessionOrCreate(tx, identifier);
  }

  /**
   * 세션을 ACTIVE 상태로 활성화
   */
  async activateSession(
    tx: Tx | undefined,
    tableSession: TableSession,
    payload?: SessionActivatePayload
  ): Promise<PublicSession> {
    return await this.sessionCore.txActivateSession(
      tx,
      tableSession,
      payload ?? {}
    );
  }

  /**
   * 세션을 CLOSED 상태로 비활성화
   */
  async deactivateSession(
    tx: Tx | undefined,
    tableSession: TableSession
  ): Promise<PublicSession> {
    return await this.sessionCore.txDeactivateSession(tx, tableSession);
  }

  /**
   * 세션 만료 시간 연장
   */
  async extendSessionExpiry(
    tx: Tx | undefined,
    tableSession: TableSession
  ): Promise<PublicSession> {
    return await this.sessionCore.txExtendSessionExpiry(tx, tableSession);
  }

  /**
   * 세션 재활성화 (CLOSED → ACTIVE)
   */
  async reactivateSession(
    tx: Tx | undefined,
    tableSession: TableSession
  ): Promise<PublicSession> {
    return await this.sessionCore.txReactivateSession(tx, tableSession);
  }

  /**
   * 결제 완료 처리 및 세션 종료
   */
  async finishSessionByPayment(
    tableSession: TableSession
  ): Promise<PublicSession> {
    return await this.sessionCore.txFinishSessionByPayment(tableSession);
  }

  /**
   * 세션 상태 업데이트 (status 기반 분기 처리)
   */
  async updateSessionStatus(
    tx: Tx | undefined,
    tableSession: TableSession,
    status: TableSessionStatus | "EXTEND_EXPIRES_AT" | "REACTIVATE",
    updateDto?: SessionActivatePayload
  ): Promise<PublicSession> {
    switch (status) {
      case TableSessionStatus.ACTIVE:
        return await this.activateSession(tx, tableSession, updateDto ?? {});

      case TableSessionStatus.CLOSED:
        return await this.deactivateSession(tx, tableSession);

      case "EXTEND_EXPIRES_AT":
        return await this.extendSessionExpiry(tx, tableSession);

      case "REACTIVATE":
        return await this.reactivateSession(tx, tableSession);

      case TableSessionStatus.PAYMENT_PENDING:
        return await this.finishSessionByPayment(tableSession);

      default:
        throw new Error(`Unsupported session status: ${status}`);
    }
  }
}
