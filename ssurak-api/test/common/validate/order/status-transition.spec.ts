import { HttpStatus } from "@nestjs/common";
import { OrderStatus } from "@ssurak/db";
import { describe, expect, it } from "vitest";
import {
  buildOrderStatusTimestamps,
  validateOrderStatusTransition,
} from "src/common/validate/order/status-transition";
import { expectHttpException } from "test/helpers/expect-http-exception";

describe("validateOrderStatusTransition", () => {
  it.each([
    [OrderStatus.PENDING, OrderStatus.ACCEPTED],
    [OrderStatus.ACCEPTED, OrderStatus.PREPARING],
    [OrderStatus.PREPARING, OrderStatus.COMPLETED],
    [OrderStatus.PENDING, OrderStatus.COMPLETED], // 단계 건너뛰기 허용
    [OrderStatus.PENDING, OrderStatus.CANCELLED],
    [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  ])("%s → %s 은 허용된다", (current, next) => {
    expect(() => validateOrderStatusTransition(current, next)).not.toThrow();
  });

  it.each([
    [OrderStatus.ACCEPTED, OrderStatus.PENDING], // 역행
    [OrderStatus.COMPLETED, OrderStatus.PREPARING], // 역행
    [OrderStatus.PENDING, OrderStatus.PENDING], // 동일 상태
    [OrderStatus.CANCELLED, OrderStatus.PENDING], // 취소 복구 불가
    [OrderStatus.CANCELLED, OrderStatus.CANCELLED],
  ])("%s → %s 은 ORDER_STATUS_INVALID_TRANSITION(400)", (current, next) => {
    expectHttpException(() => validateOrderStatusTransition(current, next), {
      code: "ORDER_STATUS_INVALID_TRANSITION",
      status: HttpStatus.BAD_REQUEST,
      details: { from: current, to: next },
    });
  });
});

describe("buildOrderStatusTimestamps", () => {
  const notAccepted = { acceptedAt: null };

  it("ACCEPTED 진입 시 acceptedAt을 기록한다", () => {
    const stamps = buildOrderStatusTimestamps(
      notAccepted,
      OrderStatus.ACCEPTED
    );
    expect(stamps.acceptedAt).toBeInstanceOf(Date);
    expect(stamps).not.toHaveProperty("completedAt");
  });

  it("PREPARING으로 건너뛰어도 acceptedAt을 보정한다", () => {
    const stamps = buildOrderStatusTimestamps(
      notAccepted,
      OrderStatus.PREPARING
    );
    expect(stamps.acceptedAt).toBeInstanceOf(Date);
  });

  it("COMPLETED 진입 시 completedAt과 (비어 있으면) acceptedAt을 기록한다", () => {
    const stamps = buildOrderStatusTimestamps(
      notAccepted,
      OrderStatus.COMPLETED
    );
    expect(stamps.acceptedAt).toBeInstanceOf(Date);
    expect(stamps.completedAt).toBeInstanceOf(Date);
  });

  it("이미 수락된 주문의 acceptedAt은 덮어쓰지 않는다", () => {
    const acceptedAt = new Date("2026-01-01T00:00:00.000Z");
    const stamps = buildOrderStatusTimestamps(
      { acceptedAt },
      OrderStatus.COMPLETED
    );
    expect(stamps.acceptedAt).toBe(acceptedAt);
  });

  it("CANCELLED는 타임스탬프를 기록하지 않는다", () => {
    expect(
      buildOrderStatusTimestamps(notAccepted, OrderStatus.CANCELLED)
    ).toEqual({});
  });
});
