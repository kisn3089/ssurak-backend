import { Injectable } from "@nestjs/common";
import {
  TableSession,
  PublicSession,
  PublicSessionWithTable,
  SessionWithTable,
  TableWithStoreContext,
} from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import {
  UpdateTableSessionDto,
  UpdateCustomerTableSessionDto,
} from "./session.controller";
import { Tx } from "src/utils/helper/transactionPipe";
import {
  INCLUDE_TABLE,
  INCLUDE_TABLE_STORE_AVAILABLE_MENUS,
  ALIVE_SESSION_STATUSES,
  SESSION_OMIT,
  ORDER_WITH_ITEMS_RECORD,
} from "src/common/query/session-query.const";
import { SessionClient } from "src/internal/clients/session.client";
import { SessionIdentifier } from "src/internal/services/session-core.service";
import { TABLE_OMIT } from "src/common/query/table-query.const";

type StoreIdAndSessionIdParams = {
  storeId: string;
  sessionId: string;
};

@Injectable()
export class SessionService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionClient: SessionClient
  ) {}

  // ============ Store Session Methods ============

  async findActivatedSessionOrCreate(
    identifier: SessionIdentifier
  ): Promise<SessionWithTable> {
    return await this.prismaService.$transaction(async (tx) => {
      return await this.sessionClient.txGetOrCreateSession(tx, identifier);
    });
  }

  async getSessionList(
    storeId: string
  ): Promise<PublicSessionWithTable<"Wide">[]> {
    return await this.prismaService.tableSession.findMany({
      where: { table: { store: { publicId: storeId } } },
      omit: SESSION_OMIT,
      include: {
        table: { omit: TABLE_OMIT },
        orders: ORDER_WITH_ITEMS_RECORD,
      },
    });
  }

  async getSessionUniqueByOwner({
    sessionId,
    storeId,
  }: StoreIdAndSessionIdParams): Promise<PublicSessionWithTable<"Wide">> {
    return await this.prismaService.tableSession.findFirstOrThrow({
      where: {
        publicId: sessionId,
        table: { store: { publicId: storeId } },
      },
      omit: SESSION_OMIT,
      include: {
        table: { omit: TABLE_OMIT },
        orders: ORDER_WITH_ITEMS_RECORD,
      },
    });
  }

  async getSessionAndPartialUpdate(
    { sessionId, storeId }: StoreIdAndSessionIdParams,
    updateSessionPayload: UpdateTableSessionDto
  ): Promise<PublicSession> {
    const activeSession = await this.getSessionByOwner({
      sessionId,
      storeId,
    });

    return await this.txableUpdateSession(activeSession, updateSessionPayload);
  }

  async getSessionByOwner({
    sessionId,
    storeId,
  }: StoreIdAndSessionIdParams): Promise<SessionWithTable> {
    return await this.prismaService.tableSession.findFirstOrThrow({
      where: { publicId: sessionId, table: { store: { publicId: storeId } } },
      include: INCLUDE_TABLE,
    });
  }

  async txableUpdateSession(
    tableSession: TableSession,
    updateSessionPayload: UpdateTableSessionDto | UpdateCustomerTableSessionDto,
    tx?: Tx
  ): Promise<PublicSession> {
    const { status, ...rest } = updateSessionPayload;
    const updateDto = status === "ACTIVE" ? rest : undefined;

    return await this.sessionClient.updateSessionStatus(
      tx,
      tableSession,
      status,
      updateDto
    );
  }

  async getStoreContext(
    sessionToken: string
  ): Promise<TableSession & { table: TableWithStoreContext }> {
    return await this.prismaService.tableSession.findFirstOrThrow({
      where: this.whereAliveSession(sessionToken),
      include: INCLUDE_TABLE_STORE_AVAILABLE_MENUS,
    });
  }

  async getActiveSession(sessionToken: string): Promise<TableSession> {
    return await this.prismaService.tableSession.findFirstOrThrow({
      where: this.whereAliveSession(sessionToken),
    });
  }

  private whereAliveSession(sessionToken: string) {
    return {
      sessionToken,
      expiresAt: { gt: new Date() },
      status: { in: ALIVE_SESSION_STATUSES },
    } as const;
  }
}
