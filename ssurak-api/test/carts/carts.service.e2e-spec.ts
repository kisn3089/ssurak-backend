import { HttpStatus } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import { Menu, SessionWithTable, TableSessionStatus } from "@ssurak/db";
import Redis from "ioredis";
import Redlock from "redlock";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CartService } from "src/carts/carts.service";
import { PrismaService } from "src/prisma/prisma.service";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";

/**
 * 실제 Redis(+Redlock)에 붙는 통합 테스트.
 * 사전 조건: docker compose -f ../docker-compose.dev.yml up -d redis
 * Prisma는 mock — 메뉴 조회/세션 조회만 스텁한다.
 */

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

// 운영(redis.module.ts)과 동일한 설정
const redlock = new Redlock([redis], { retryCount: 3, retryDelay: 200 });

const prismaMock = {
  menu: { findFirstOrThrow: vi.fn() },
  tableSession: { findFirst: vi.fn() },
};

const service = new CartService(
  redis,
  redlock,
  prismaMock as unknown as PrismaService
);

const menuFixture = (overrides: Partial<Menu> = {}) =>
  ({
    id: 1n,
    publicId: "menu-americano",
    name: "아메리카노",
    imageUrl: null,
    price: 3000,
    isAvailable: true,
    requiredOptions: {
      사이즈: {
        options: [
          { key: "톨", price: 0 },
          { key: "라지", price: 500 },
        ],
        defaultKey: "톨",
      },
    },
    customOptions: null,
    ...overrides,
  }) as Menu;

const usedSessionTokens: string[] = [];

const sessionFixture = (
  overrides: Partial<SessionWithTable> = {}
): SessionWithTable => {
  const sessionToken = createId();
  usedSessionTokens.push(sessionToken);

  return {
    id: 1n,
    publicId: "session-public-id",
    tableId: 10n,
    status: TableSessionStatus.ACTIVE,
    sessionToken,
    activatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    closedAt: null,
    table: {
      publicId: "table-public-id",
      store: { publicId: "store-public-id" },
    },
    ...overrides,
  } as SessionWithTable;
};

const americanoPayload = (quantity = 1) => ({
  menuPublicId: "menu-americano",
  quantity,
  requiredOptions: { 사이즈: "라지" },
});

beforeAll(async () => {
  try {
    await redis.connect();
    await redis.ping();
  } catch (error) {
    throw new Error(
      `Redis 접속 실패 — 통합 테스트는 실행 중인 Redis가 필요합니다. ` +
        `루트에서 "docker compose -f docker-compose.dev.yml up -d redis" 실행 후 다시 시도하세요. (${error})`
    );
  }
});

beforeEach(() => {
  prismaMock.menu.findFirstOrThrow.mockResolvedValue(menuFixture());
});

afterEach(async () => {
  vi.restoreAllMocks();
  const keys = usedSessionTokens.flatMap((token) => [
    `cart:${token}`,
    `lock:cart:${token}`,
  ]);
  if (keys.length > 0) await redis.del(...keys);
  usedSessionTokens.length = 0;
});

afterAll(async () => {
  await redis.quit();
});

describe("CartService.getCartList", () => {
  it("장바구니가 없으면 빈 기본 장바구니를 반환한다", async () => {
    const session = sessionFixture();
    const cart = await service.getCart(session.sessionToken);

    expect(cart).toEqual({
      sessionToken: session.sessionToken,
      menus: [],
      updatedAt: "",
    });
  });

  it("Redis에 손상된 JSON이 있으면 CART_JSON_PARSE_ERROR(422)를 던지고 키를 삭제한다", async () => {
    const session = sessionFixture();
    await redis.set(`cart:${session.sessionToken}`, "{손상된 json");

    await expectHttpExceptionAsync(
      () => service.getCart(session.sessionToken),
      {
        code: "CART_JSON_PARSE_ERROR",
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      }
    );
    expect(await redis.exists(`cart:${session.sessionToken}`)).toBe(0);
  });
});

describe("CartService.addItem", () => {
  it("새 아이템을 추가하면 옵션 가격이 합산된 장바구니가 세션 TTL로 저장된다", async () => {
    const session = sessionFixture();
    const { cart, subscriber, meta } = await service.addItem(
      session,
      americanoPayload(2)
    );

    expect(cart.menus).toHaveLength(1);
    expect(cart.menus[0]).toMatchObject({
      menuPublicId: "menu-americano",
      menuName: "아메리카노",
      basePrice: 3000,
      optionsPrice: 500,
      unitPrice: 3500,
      quantity: 2,
      requiredOptions: { 사이즈: "라지" },
    });
    expect(meta).toEqual({ menuName: "아메리카노" });
    expect(subscriber).toEqual({
      storePublicId: "store-public-id",
      tablePublicId: "table-public-id",
    });

    // 세션 만료(1시간)에 맞춘 TTL이 실제로 걸려 있어야 한다
    const ttl = await redis.ttl(`cart:${session.sessionToken}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60 * 60);
  });

  it("동일 옵션 조합(fingerprint)이면 수량을 병합하고 isMerged를 표시한다", async () => {
    const session = sessionFixture();
    await service.addItem(session, americanoPayload(1));
    const { cart, meta } = await service.addItem(session, americanoPayload(2));

    expect(cart.menus).toHaveLength(1);
    expect(cart.menus[0].quantity).toBe(3);
    expect(meta).toEqual({ menuName: "아메리카노", isMerged: true });
  });

  it("옵션이 다르면 별도 아이템으로 추가된다", async () => {
    const session = sessionFixture();
    await service.addItem(session, americanoPayload(1));
    const { cart } = await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      requiredOptions: { 사이즈: "톨" },
    });

    expect(cart.menus).toHaveLength(2);
    const fingerprints = cart.menus.map((m) => m.fingerprint);
    expect(new Set(fingerprints).size).toBe(2);
  });

  it("만료된 세션이면 SESSION_EXPIRED(400)를 던진다", async () => {
    const session = sessionFixture({
      expiresAt: new Date(Date.now() - 1000),
    });

    await expectHttpExceptionAsync(
      () => service.addItem(session, americanoPayload()),
      { code: "SESSION_EXPIRED", status: HttpStatus.BAD_REQUEST }
    );
  });

  it("비활성 메뉴면 MENU_NOT_AVAILABLE(400)를 던지고 장바구니를 만들지 않는다", async () => {
    prismaMock.menu.findFirstOrThrow.mockResolvedValue(
      menuFixture({ isAvailable: false })
    );
    const session = sessionFixture();

    await expectHttpExceptionAsync(
      () => service.addItem(session, americanoPayload()),
      { code: "MENU_NOT_AVAILABLE", status: HttpStatus.BAD_REQUEST }
    );
    expect(await redis.exists(`cart:${session.sessionToken}`)).toBe(0);
  });
});

describe("CartService.updateItem", () => {
  it("수량과 옵션을 변경하면 가격이 재계산된다", async () => {
    const session = sessionFixture();
    const { cart: added } = await service.addItem(session, americanoPayload(1));
    const itemId = added.menus[0].id;

    const { cart } = await service.updateItem(session, itemId, {
      quantity: 5,
      requiredOptions: { 사이즈: "톨" },
    });

    expect(cart.menus[0]).toMatchObject({
      quantity: 5,
      optionsPrice: 0,
      unitPrice: 3000,
      requiredOptions: { 사이즈: "톨" },
    });
  });

  it("변경 결과가 다른 아이템과 같은 조합이 되면 하나로 병합한다", async () => {
    const session = sessionFixture();
    const { cart: first } = await service.addItem(session, americanoPayload(2));
    const tallItem = await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      requiredOptions: { 사이즈: "톨" },
    });
    const tallItemId = tallItem.cart.menus.find(
      (m) => m.id !== first.menus[0].id
    )!.id;

    // 톨 → 라지로 변경하면 기존 라지 아이템과 병합돼야 한다
    const { cart, meta } = await service.updateItem(session, tallItemId, {
      requiredOptions: { 사이즈: "라지" },
    });

    expect(cart.menus).toHaveLength(1);
    expect(cart.menus[0].quantity).toBe(3);
    expect(meta.isMerged).toBe(true);
  });

  it("없는 아이템이면 CART_ITEM_NOT_FOUND(404)", async () => {
    const session = sessionFixture();
    await service.addItem(session, americanoPayload());

    await expectHttpExceptionAsync(
      () => service.updateItem(session, "ghost-item-id", { quantity: 2 }),
      { code: "CART_ITEM_NOT_FOUND", status: HttpStatus.NOT_FOUND }
    );
  });
});

describe("CartService.removeItem", () => {
  it("아이템을 제거하고 제거된 메뉴명을 meta로 알려준다", async () => {
    const session = sessionFixture();
    const { cart: added } = await service.addItem(session, americanoPayload());

    const { cart, meta } = await service.removeItem(session, added.menus[0].id);

    expect(cart.menus).toHaveLength(0);
    expect(meta).toEqual({ menuName: "아메리카노" });
  });

  it("없는 아이템이면 CART_ITEM_NOT_FOUND(404)", async () => {
    const session = sessionFixture();

    await expectHttpExceptionAsync(
      () => service.removeItem(session, "ghost-item-id"),
      { code: "CART_ITEM_NOT_FOUND", status: HttpStatus.NOT_FOUND }
    );
  });
});

describe("CartService.clearCart", () => {
  it("장바구니 키를 삭제하고 구독자 정보를 반환한다", async () => {
    const session = sessionFixture();
    await service.addItem(session, americanoPayload());

    const subscriber = await service.clearCart(session);

    expect(subscriber).toEqual({
      storePublicId: "store-public-id",
      tablePublicId: "table-public-id",
    });
    expect(await redis.exists(`cart:${session.sessionToken}`)).toBe(0);
  });

  it("다른 클라이언트가 락을 점유 중이면 CART_LOCK_FAILED(503)", async () => {
    const session = sessionFixture();
    const externalLock = await redlock.acquire(
      [`lock:cart:${session.sessionToken}`],
      5000
    );

    try {
      await expectHttpExceptionAsync(() => service.clearCart(session), {
        code: "CART_LOCK_FAILED",
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    } finally {
      await externalLock.release();
    }
  });
});

describe("CartService.removeOrderedItems", () => {
  it("주문된 수량만 차감하고 주문 중 늘어난 수량과 새 항목은 보존한다", async () => {
    const session = sessionFixture();
    // 주문 스냅샷: 라지 2개
    const { cart: snapshot } = await service.addItem(
      session,
      americanoPayload(2)
    );
    const orderedItems = snapshot.menus.map((m) => ({
      id: m.id,
      quantity: m.quantity,
    }));

    // 주문 처리 중 다른 기기에서: 같은 항목 +1, 새 항목(톨) 추가
    await service.addItem(session, americanoPayload(1));
    await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      requiredOptions: { 사이즈: "톨" },
    });

    await service.removeOrderedItems(session, orderedItems);
    const cart = await service.getCart(session.sessionToken);

    expect(cart.menus).toHaveLength(2);
    const merged = cart.menus.find((m) => m.id === orderedItems[0].id);
    expect(merged?.quantity).toBe(1); // 3(2+1) - 주문된 2
  });

  it("전부 차감되면 장바구니 키를 삭제한다", async () => {
    const session = sessionFixture();
    const { cart } = await service.addItem(session, americanoPayload(2));

    await service.removeOrderedItems(
      session,
      cart.menus.map((m) => ({ id: m.id, quantity: m.quantity }))
    );

    expect(await redis.exists(`cart:${session.sessionToken}`)).toBe(0);
  });
});

describe("CartService.getCartByStore", () => {
  it("세션이 매장에 속하면 장바구니를 반환한다", async () => {
    const session = sessionFixture();
    await service.addItem(session, americanoPayload());
    prismaMock.tableSession.findFirst.mockResolvedValue(session);

    const cart = await service.getCartByStore(
      "store-public-id",
      session.sessionToken
    );

    expect(cart.menus).toHaveLength(1);
  });

  it("세션이 없거나 매장이 다르면 INVALID_TABLE_SESSION(404)", async () => {
    prismaMock.tableSession.findFirst.mockResolvedValue(null);

    await expectHttpExceptionAsync(
      () => service.getCartByStore("other-store", "unknown-token"),
      { code: "INVALID_TABLE_SESSION", status: HttpStatus.NOT_FOUND }
    );
  });
});
