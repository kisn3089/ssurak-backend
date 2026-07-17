import { Injectable } from "@nestjs/common";
import {
  TableSession,
  Prisma,
  TableSessionStatus,
  PublicSession,
  SessionWithTable,
  OrderItem,
} from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import { Tx } from "src/utils/helper/transactionPipe";
import {
  isActivateTableOrThrow,
  isSessionExpired,
} from "src/common/validate/session/alive-session";
import {
  ALIVE_SESSION_STATUSES,
  ONE_HOURS,
  TWO_HOURS,
  SESSION_OMIT,
  INCLUDE_TABLE,
  TWENTY_MINUTE,
} from "src/common/query/session-query.const";
import { generateSecureSessionToken } from "src/utils/lib/crypt";
import { HttpException, HttpStatus } from "@nestjs/common";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { sumFromObjects } from "@ssurak/schema";

export type TableIdentifier = { publicId: string } | { qrCode: string };
export type SessionIdentifier = TableIdentifier | { id: bigint };
export type SessionActivatePayload = { paidAmount?: number };

@Injectable()
export class SessionCoreService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * 트랜잭션 내에서 활성 세션을 조회하거나 새로 생성
   * - publicId, qrCode: 테이블 기준 조회 → 세션 없으면 새로 생성
   * - id: 세션 ID 기준 조회 → 유효한 세션 없으면 에러
   */
  async txGetActivatedSessionOrCreate(
    tx: Tx,
    identifier: SessionIdentifier
  ): Promise<SessionWithTable> {
    const activeSession = await tx.tableSession.findFirst({
      ...this.buildActiveSessionQuery(identifier),
    });

    const validSession = await this.validateSessionWithDeactivate(
      tx,
      activeSession
    );

    if (validSession) {
      return validSession;
    }

    if (this.isSessionIdIdentifier(identifier)) {
      throw new HttpException(
        exceptionContentsIs("INVALID_TABLE_SESSION"),
        HttpStatus.NOT_FOUND
      );
    }

    return await this.createSessionFromTable(tx, identifier);
  }
  /** 세션을 ACTIVE 상태로 활성화 */
  async txActivateSession(
    tx: Tx | undefined,
    tableSession: TableSession,
    updateSessionDto: SessionActivatePayload
  ): Promise<PublicSession> {
    const service = tx ?? this.prismaService;
    return await service.tableSession.update(
      this.buildSetSessionActivate(tableSession, updateSessionDto)
    );
  }

  /** 세션을 CLOSED 상태로 비활성화 */
  async txDeactivateSession(
    tx: Tx | undefined,
    tableSession: TableSession
  ): Promise<PublicSession> {
    const service = tx ?? this.prismaService;
    return await service.tableSession.update(
      this.buildSetSessionDeactivate(tableSession)
    );
  }

  /** 세션 만료 시간 연장 */
  async txExtendSessionExpiry(
    tx: Tx | undefined,
    tableSession: TableSession
  ): Promise<PublicSession> {
    const service = tx ?? this.prismaService;
    return await service.tableSession.update(
      this.buildSetSessionExtendExpiresAt(tableSession)
    );
  }

  /** 세션 재활성화 (CLOSED → ACTIVE) */
  async txReactivateSession(
    tx: Tx | undefined,
    tableSession: TableSession
  ): Promise<PublicSession> {
    const service = tx ?? this.prismaService;
    return await service.tableSession.update({
      where: { sessionToken: tableSession.sessionToken },
      data: { status: TableSessionStatus.ACTIVE, closedAt: null },
      omit: SESSION_OMIT,
    });
  }

  /** 결제 완료 처리 및 세션 종료 */
  async txFinishSessionByPayment(
    tableSession: TableSession
  ): Promise<PublicSession> {
    return await this.prismaService.$transaction(async (tx) => {
      const sessionOrders = await tx.order.findMany({
        where: { tableSessionId: tableSession.id },
        include: { orderItems: true },
      });

      if (!sessionOrders.length) {
        throw new HttpException(
          exceptionContentsIs("ORDER_IS_EMPTY"),
          HttpStatus.NOT_FOUND
        );
      }

      const flatMappedOrderItems = sessionOrders.flatMap(
        (order) => order.orderItems
      );

      const totalAmount = sumFromObjects<OrderItem>(
        flatMappedOrderItems,
        (orderItems) => orderItems.unitPrice * orderItems.quantity
      );

      return await tx.tableSession.update({
        where: { sessionToken: tableSession.sessionToken },
        data: {
          paidAmount: totalAmount,
          status: TableSessionStatus.CLOSED,
          closedAt: new Date(),
        },
        omit: SESSION_OMIT,
      });
    });
  }

  // ============ Private Helper Methods ============

  private buildActiveSessionQuery(identifier: SessionIdentifier) {
    return {
      where: {
        ...this.buildSessionIdentifier(identifier),
        status: { in: ALIVE_SESSION_STATUSES },
      },
      include: INCLUDE_TABLE,
    };
  }

  private buildSessionIdentifier(identifier: SessionIdentifier) {
    if ("id" in identifier) {
      return { id: identifier.id };
    }

    return { table: { ...identifier } };
  }

  private isSessionIdIdentifier(
    identifier: SessionIdentifier
  ): identifier is { id: bigint } {
    return "id" in identifier;
  }

  private async createSessionFromTable(
    tx: Tx,
    identifier: TableIdentifier
  ): Promise<SessionWithTable> {
    const table = await tx.table.findFirstOrThrow({
      where: { ...identifier },
    });

    isActivateTableOrThrow(table.isActive);

    const sessionToken = generateSecureSessionToken();
    return await tx.tableSession.create({
      data: {
        table: { connect: { id: table.id } },
        sessionToken,
        expiresAt: TWENTY_MINUTE(),
      },
      include: INCLUDE_TABLE,
    });
  }

  private async validateSessionWithDeactivate(
    tx: Tx,
    activeSession: SessionWithTable | null
  ): Promise<SessionWithTable | null> {
    if (!activeSession) {
      return null;
    }

    isActivateTableOrThrow(activeSession.table.isActive);
    if (isSessionExpired(activeSession)) {
      await tx.tableSession.update(
        this.buildSetSessionDeactivate(activeSession)
      );
      return null;
    }

    return activeSession;
  }

  private buildSetSessionDeactivate(
    tableSession: TableSession
  ): Prisma.TableSessionUpdateArgs {
    return {
      where: { sessionToken: tableSession.sessionToken },
      data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
      omit: SESSION_OMIT,
    };
  }

  private buildSetSessionActivate(
    tableSession: TableSession,
    updateSessionDto: SessionActivatePayload
  ): Prisma.TableSessionUpdateArgs {
    return {
      where: { sessionToken: tableSession.sessionToken },
      data: {
        ...updateSessionDto,
        status: TableSessionStatus.ACTIVE,
        expiresAt: TWO_HOURS(),
      },
      omit: SESSION_OMIT,
    };
  }

  private buildSetSessionExtendExpiresAt(
    tableSession: TableSession
  ): Prisma.TableSessionUpdateArgs {
    return {
      where: {
        sessionToken: tableSession.sessionToken,
        status: { in: ALIVE_SESSION_STATUSES },
      },
      data: { expiresAt: ONE_HOURS(tableSession.expiresAt) },
      omit: SESSION_OMIT,
    };
  }
}
