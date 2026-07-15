import { HttpStatus, INestApplication } from "@nestjs/common";
import { TableSessionStatus } from "@ssurak/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SessionCoreService } from "src/internal/services/session-core.service";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";
import {
  cleanupStoreDomain,
  createSession,
  seedStoreDomain,
  SeededStoreDomain,
} from "test/helpers/seed-store";

const MINUTE = 60 * 1000;

/** expiresAt이 (지금 + expectedMinutes)분 근처(±1분)인지 검증 */
function expectExpiresInMinutes(expiresAt: Date, expectedMinutes: number) {
  const deltaMinutes = (expiresAt.getTime() - Date.now()) / MINUTE;
  expect(deltaMinutes).toBeGreaterThan(expectedMinutes - 1);
  expect(deltaMinutes).toBeLessThan(expectedMinutes + 1);
}

describe("SessionCoreService (통합)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessionCore: SessionCoreService;
  let domain: SeededStoreDomain;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    sessionCore = app.get(SessionCoreService);
    domain = await seedStoreDomain(prisma);
  });

  afterAll(async () => {
    await cleanupStoreDomain(prisma, domain);
    await app.close();
  });

  const closeAllSessions = async () =>
    await prisma.tableSession.updateMany({
      where: { tableId: domain.table.id },
      data: { status: TableSessionStatus.CLOSED, closedAt: new Date() },
    });

  describe("txGetActivatedSessionOrCreate", () => {
    it("활성 세션이 없으면 20분짜리 WAITING_ORDER 세션을 새로 만든다", async () => {
      await closeAllSessions();

      const session = await prisma.$transaction((tx) =>
        sessionCore.txGetActivatedSessionOrCreate(tx, {
          publicId: domain.table.publicId,
        })
      );

      expect(session.status).toBe(TableSessionStatus.WAITING_ORDER);
      expect(session.table.id).toBe(domain.table.id);
      expectExpiresInMinutes(session.expiresAt, 20);
    });

    it("살아있는 세션이 있으면 재사용한다", async () => {
      await closeAllSessions();
      const existing = await createSession(prisma, domain.table);

      const session = await prisma.$transaction((tx) =>
        sessionCore.txGetActivatedSessionOrCreate(tx, {
          qrCode: domain.table.qrCode,
        })
      );

      expect(session.id).toBe(existing.id);
    });

    it("만료된 세션은 CLOSED 처리하고 새 세션을 만든다", async () => {
      await closeAllSessions();
      const expired = await createSession(prisma, domain.table, {
        expiresAt: new Date(Date.now() - MINUTE),
      });

      const session = await prisma.$transaction((tx) =>
        sessionCore.txGetActivatedSessionOrCreate(tx, {
          publicId: domain.table.publicId,
        })
      );

      expect(session.id).not.toBe(expired.id);
      const reloaded = await prisma.tableSession.findUniqueOrThrow({
        where: { id: expired.id },
      });
      expect(reloaded.status).toBe(TableSessionStatus.CLOSED);
      expect(reloaded.closedAt).not.toBeNull();
    });

    it("세션 id로 조회했는데 유효한 세션이 없으면 INVALID_TABLE_SESSION(404)", async () => {
      await closeAllSessions();
      const closed = await createSession(prisma, domain.table, {
        status: TableSessionStatus.CLOSED,
      });

      await expectHttpExceptionAsync(
        () =>
          prisma.$transaction((tx) =>
            sessionCore.txGetActivatedSessionOrCreate(tx, { id: closed.id })
          ),
        { code: "INVALID_TABLE_SESSION", status: HttpStatus.NOT_FOUND }
      );
    });

    it("비활성 테이블이면 TABLE_INACTIVE(403)로 세션을 만들지 않는다", async () => {
      await closeAllSessions();
      await prisma.table.update({
        where: { id: domain.table.id },
        data: { isActive: false },
      });

      try {
        await expectHttpExceptionAsync(
          () =>
            prisma.$transaction((tx) =>
              sessionCore.txGetActivatedSessionOrCreate(tx, {
                publicId: domain.table.publicId,
              })
            ),
          { code: "TABLE_INACTIVE", status: HttpStatus.FORBIDDEN }
        );
      } finally {
        await prisma.table.update({
          where: { id: domain.table.id },
          data: { isActive: true },
        });
      }
    });
  });

  describe("세션 상태 전환", () => {
    it("활성화하면 ACTIVE + 2시간 만료로 갱신된다", async () => {
      const session = await createSession(prisma, domain.table, {
        status: TableSessionStatus.WAITING_ORDER,
      });

      const activated = await sessionCore.txActivateSession(
        undefined,
        session,
        { paidAmount: 0 }
      );

      expect(activated.status).toBe(TableSessionStatus.ACTIVE);
      expectExpiresInMinutes(activated.expiresAt, 120);
    });

    it("연장하면 기존 만료 시각에서 1시간 늘어난다", async () => {
      const session = await createSession(prisma, domain.table);
      const baseExpiresAt = session.expiresAt;

      const extended = await sessionCore.txExtendSessionExpiry(
        undefined,
        session
      );

      expect(extended.expiresAt.getTime()).toBe(
        baseExpiresAt.getTime() + 60 * MINUTE
      );
    });

    it("비활성화하면 CLOSED + closedAt이 기록된다", async () => {
      const session = await createSession(prisma, domain.table);

      const closed = await sessionCore.txDeactivateSession(undefined, session);

      expect(closed.status).toBe(TableSessionStatus.CLOSED);
      expect(closed.closedAt).not.toBeNull();
    });
  });

  describe("txFinishSessionByPayment", () => {
    it("주문 합계를 paidAmount로 정산하고 세션을 종료한다", async () => {
      const session = await createSession(prisma, domain.table);
      await prisma.order.create({
        data: {
          storeId: domain.store.id,
          tableId: domain.table.id,
          tableSessionId: session.id,
          orderItems: {
            create: [
              {
                menuId: domain.simpleMenu.id,
                menuName: "생수",
                basePrice: 1000,
                unitPrice: 1000,
                quantity: 3,
              },
              {
                menuId: domain.menuWithOptions.id,
                menuName: "아메리카노",
                basePrice: 3000,
                optionsPrice: 500,
                unitPrice: 3500,
                quantity: 2,
              },
            ],
          },
        },
      });

      const finished = await sessionCore.txFinishSessionByPayment(session);

      expect(finished.status).toBe(TableSessionStatus.CLOSED);
      expect(finished.paidAmount).toBe(1000 * 3 + 3500 * 2);
      expect(finished.closedAt).not.toBeNull();
    });

    it("주문이 없는 세션은 ORDER_IS_EMPTY로 거부된다", async () => {
      const session = await createSession(prisma, domain.table);

      await expectHttpExceptionAsync(
        () => sessionCore.txFinishSessionByPayment(session),
        { code: "ORDER_IS_EMPTY", status: HttpStatus.NOT_FOUND }
      );
    });
  });
});
