import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  Order,
  OrderStatus,
  TableSession,
  TableSessionStatus,
} from "@ssurak/db";
import { validateOrderSessionToWrite } from "src/common/validate/order/order-session-to-write";
import { expectHttpException } from "test/helpers/expect-http-exception";

type OrderWithSession = Order & { tableSession: TableSession };

const orderFixture = (
  orderStatus: OrderStatus,
  sessionStatus: TableSessionStatus
): OrderWithSession =>
  ({
    id: 1n,
    publicId: "order-public-id",
    status: orderStatus,
    tableSession: {
      id: 1n,
      publicId: "session-public-id",
      status: sessionStatus,
      sessionToken: "session-token",
      expiresAt: new Date(Date.now() + 60_000),
    },
  }) as OrderWithSession;

describe("validateOrderSessionToWrite", () => {
  it("주문이 없으면 NOT_FOUND(404)", () => {
    expectHttpException(() => validateOrderSessionToWrite(null), {
      code: "NOT_FOUND",
      status: HttpStatus.NOT_FOUND,
    });
  });

  it("취소된 주문이면 ORDER_ALREADY_CANCELLED(400)", () => {
    expectHttpException(
      () =>
        validateOrderSessionToWrite(
          orderFixture(OrderStatus.CANCELLED, TableSessionStatus.ACTIVE)
        ),
      { code: "ORDER_ALREADY_CANCELLED", status: HttpStatus.BAD_REQUEST }
    );
  });

  it("세션 상태가 CLOSED면 SESSION_INACTIVE(400)", () => {
    expectHttpException(
      () =>
        validateOrderSessionToWrite(
          orderFixture(OrderStatus.PENDING, TableSessionStatus.CLOSED)
        ),
      { code: "SESSION_INACTIVE", status: HttpStatus.BAD_REQUEST }
    );
  });

  it.each([TableSessionStatus.ACTIVE, TableSessionStatus.WAITING_ORDER])(
    "세션 상태가 %s면 주문을 그대로 반환한다",
    (sessionStatus) => {
      const order = orderFixture(OrderStatus.PENDING, sessionStatus);
      expect(validateOrderSessionToWrite(order)).toBe(order);
    }
  );
});
