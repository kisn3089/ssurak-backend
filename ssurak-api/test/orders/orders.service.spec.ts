import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type Redlock from "redlock";
import { Prisma } from "@ssurak/db";
import { CartService } from "src/carts/carts.service";
import { StoreOpenStateService } from "src/common/business-hours";
import { MenuImageService } from "src/common/image/menu-image.service";
import { SessionClient } from "src/internal/clients/session.client";
import { OrdersService } from "src/orders/orders/orders.service";
import {
  CreateOrderOptions,
  CreateOrderParams,
  CreateOrderPayload,
} from "src/orders/orders/orders.service.type";
import { ORDER_SEQ_MAX_RETRY } from "src/orders/orders/order-number";
import { PrismaService } from "src/prisma/prisma.service";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";

const ORDER_SEQ_INDEX = "order_store_id_business_date_order_seq_key";

const uniqueViolation = (target: string) =>
  new Prisma.PrismaClientKnownRequestError("unique 위반", {
    code: "P2002",
    clientVersion: "6.0.0",
    meta: { target },
  });

const prisma = mockDeep<PrismaService>();
const service = new OrdersService(
  prisma,
  mockDeep<SessionClient>(),
  mockDeep<CartService>(),
  mockDeep<MenuImageService>(),
  mockDeep<StoreOpenStateService>(),
  mockDeep<Redlock>()
);

const params: CreateOrderParams = { id: 1n };
const options: CreateOrderOptions = { enforceBusinessHours: false };
const payload = (
  overrides: Partial<CreateOrderPayload> = {}
): CreateOrderPayload => ({ orderItems: [], ...overrides });

/**
 * 재시도 루프는 private이고, 진입점(createOrder)은 세션·장바구니까지 끌고 온다.
 * 루프만 보려고 트랜잭션 한 겹만 갈아끼우고 루프를 직접 부른다.
 * 반환값은 갈아끼운 트랜잭션이 준 것이므로 unknown으로 받는다.
 */
const createOrder = async (
  payloadOverrides: Partial<CreateOrderPayload> = {}
): Promise<unknown> =>
  await service["createOrderCore"](params, payload(payloadOverrides), options);

/** 거절 경로를 보는 테스트용 — 던져진 값을 그대로 돌려준다. */
const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> =>
  await promise.then(
    () => null,
    (caught: unknown) => caught
  );

let transaction: ReturnType<typeof vi.fn>;

beforeEach(() => {
  transaction = vi.fn();
  service["createOrderTransaction"] = transaction;
  prisma.order.findFirst.mockResolvedValue(null);
});

describe("OrdersService.createOrderCore — 주문번호 순번 충돌", () => {
  it("순번이 겹치면 재채번을 재시도한다", async () => {
    const created = { orderNumber: "A-0001" };
    transaction
      .mockRejectedValueOnce(uniqueViolation(ORDER_SEQ_INDEX))
      .mockResolvedValueOnce(created);

    await expect(createOrder()).resolves.toBe(created);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("재시도를 소진하면 인덱스 이름 대신 ORDER_NUMBER_CONFLICT를 던진다", async () => {
    transaction.mockRejectedValue(uniqueViolation(ORDER_SEQ_INDEX));

    // 원본 P2002가 새면 전역 필터가 "이미 사용 중인 <인덱스명> 입니다."로 옮긴다.
    await expectHttpExceptionAsync(() => createOrder(), {
      code: "ORDER_NUMBER_CONFLICT",
      status: 409,
    });

    expect(transaction).toHaveBeenCalledTimes(ORDER_SEQ_MAX_RETRY + 1);
  });

  it("멱등키 충돌인데 기존 주문을 못 찾으면 원인 파악을 위해 원본을 그대로 던진다", async () => {
    transaction.mockRejectedValue(uniqueViolation("order_idempotency_key"));

    const error = await rejectionOf(
      createOrder({ idempotencyKey: "session:1", tableSessionId: 1n })
    );

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
