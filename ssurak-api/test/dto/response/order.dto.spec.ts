import { describe, expect, it } from "vitest";
import {
  PublicOrderDto,
  PublicOrderWithItemsDto,
} from "src/dto/response/order.dto";

// Prisma row 형태 (내부 식별자 포함)
const orderRowFixture = () => ({
  id: 10n,
  publicId: "order-public-id",
  idempotencyKey: null,
  storeId: 1n,
  tableId: 2n,
  tableSessionId: 3n,
  status: "PENDING",
  memo: null,
  cancelledReason: null,
  acceptedAt: null,
  completedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const orderItemRowFixture = () => ({
  id: 20n,
  orderId: 10n,
  menuId: 30n,
  publicId: "order-item-public-id",
  menuName: "아메리카노",
  menuImageUrl: null,
  basePrice: 3000,
  optionsPrice: 500,
  unitPrice: 3500,
  quantity: 2,
  optionsSnapshot: {
    options: [
      {
        optionId: "optsize",
        name: "사이즈",
        choices: [
          { choiceId: "cholarge", name: "라지", priceDelta: 500, quantity: 1 },
        ],
      },
    ],
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
});

describe("PublicOrderDto.schema", () => {
  it("내부 식별자(id, storeId, tableId, tableSessionId)를 응답에서 제거한다", () => {
    const parsed = PublicOrderDto.schema.parse(orderRowFixture());

    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("storeId");
    expect(parsed).not.toHaveProperty("tableId");
    expect(parsed).not.toHaveProperty("tableSessionId");
    expect(parsed.publicId).toBe("order-public-id");
  });

  it("acceptedAt/completedAt Date를 ISO 문자열로 직렬화한다", () => {
    const parsed = PublicOrderDto.schema.parse({
      ...orderRowFixture(),
      acceptedAt: new Date("2026-01-02T00:00:00.000Z"),
      completedAt: new Date("2026-01-03T00:00:00.000Z"),
    });

    expect(parsed.acceptedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(parsed.completedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("정의되지 않은 주문 상태는 거부한다", () => {
    expect(() =>
      PublicOrderDto.schema.parse({
        ...orderRowFixture(),
        status: "PAYMENT_PENDING",
      })
    ).toThrow();
  });
});

describe("PublicOrderWithItemsDto.schema", () => {
  it("주문 항목의 내부 식별자(id, orderId, menuId)도 제거된다", () => {
    const parsed = PublicOrderWithItemsDto.schema.parse({
      ...orderRowFixture(),
      orderItems: [orderItemRowFixture()],
    });

    expect(parsed.orderItems).toHaveLength(1);
    expect(parsed.orderItems[0]).not.toHaveProperty("id");
    expect(parsed.orderItems[0]).not.toHaveProperty("orderId");
    expect(parsed.orderItems[0]).not.toHaveProperty("menuId");
    expect(parsed.orderItems[0].unitPrice).toBe(3500);
  });
});
