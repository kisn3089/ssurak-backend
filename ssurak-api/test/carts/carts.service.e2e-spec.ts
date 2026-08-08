import { HttpStatus } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import {
  Menu,
  OptionChoiceState,
  OptionSelectionType,
  SessionWithTable,
  TableSessionStatus,
} from "@ssurak/db";
import type { MenuValidationFields } from "src/common/validate/menu/mismatch";
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
import { mockDeep } from "vitest-mock-extended";
import { ConfigService } from "@nestjs/config";
import { MenuImageService } from "src/common/image/menu-image.service";
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

const prismaMock = mockDeep<PrismaService>();

// CDN 베이스만 있으면 되므로 ConfigService는 getOrThrow만 스텁한다.
const configService = mockDeep<ConfigService>();
configService.getOrThrow.mockReturnValue("https://cdn.example.com");
const menuImageService = new MenuImageService(configService);

const service = new CartService(redis, redlock, prismaMock, menuImageService);

type OptionGroup = MenuValidationFields["options"][number];

/** 사이즈: 필수 단일 선택 (톨 0 / 라지 +500) */
const SIZE_GROUP: OptionGroup = {
  publicId: "optsize",
  name: "사이즈",
  selectionType: OptionSelectionType.SINGLE,
  required: true,
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 10,
  enabled: true,
  trigger: null,
  choices: [
    {
      publicId: "chotall",
      name: "톨",
      priceDelta: 0,
      quantityEnabled: false,
      maxQuantity: 1,
      isDefault: true,
      sortOrder: 10,
      state: OptionChoiceState.AVAILABLE,
    },
    {
      publicId: "cholarge",
      name: "라지",
      priceDelta: 500,
      quantityEnabled: false,
      maxQuantity: 1,
      isDefault: false,
      sortOrder: 20,
      state: OptionChoiceState.AVAILABLE,
    },
  ],
};

/** 샷: 0~2개 복수 선택, 수량 3개까지 */
const SHOT_GROUP: OptionGroup = {
  publicId: "optshot",
  name: "샷 추가",
  selectionType: OptionSelectionType.MULTIPLE,
  required: false,
  minSelect: 0,
  maxSelect: 2,
  sortOrder: 20,
  enabled: true,
  trigger: null,
  choices: [
    {
      publicId: "choshot",
      name: "에스프레소 샷",
      priceDelta: 300,
      quantityEnabled: true,
      maxQuantity: 3,
      isDefault: false,
      sortOrder: 10,
      state: OptionChoiceState.AVAILABLE,
    },
    {
      publicId: "chosyrup",
      name: "시럽",
      priceDelta: 200,
      quantityEnabled: false,
      maxQuantity: 1,
      isDefault: false,
      sortOrder: 20,
      state: OptionChoiceState.AVAILABLE,
    },
  ],
};

/**
 * Prisma mock은 전체 row 타입을 요구하지만 서비스는 select로 좁힌 형태만 읽는다.
 * 두 타입을 모두 만족시키려면 스칼라를 전부 채운 뒤 options를 얹으면 된다.
 */
const menuFixture = (
  overrides: Partial<MenuValidationFields> = {}
): Menu & MenuValidationFields => ({
  id: 1n,
  publicId: "menu-americano",
  categoryId: 1n,
  name: "아메리카노",
  price: 3000,
  description: null,
  imageKey: null,
  isAvailable: true,
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  options: [SIZE_GROUP, SHOT_GROUP],
  ...overrides,
});

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
    paidAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    table: {
      id: 10n,
      publicId: "table-public-id",
      storeId: 1n,
      tableNumber: "1",
      seats: null,
      floor: null,
      section: null,
      isActive: true,
      qrCode: "table-qr-code",
      createdAt: new Date(),
      updatedAt: new Date(),
      store: { publicId: "store-public-id" },
    },
    ...overrides,
  };
};

/** 사이즈 라지(+500) 선택 */
const americanoPayload = (quantity = 1) => ({
  menuPublicId: "menu-americano",
  quantity,
  options: [selectSize("cholarge")],
});

const selectSize = (choiceId: string) => ({
  optionId: "optsize",
  choices: [{ choiceId, quantity: 1 }],
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
    `cart:deducted:${token}`,
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
      options: [
        {
          optionId: "optsize",
          name: "사이즈",
          choices: [
            {
              choiceId: "cholarge",
              name: "라지",
              priceDelta: 500,
              quantity: 1,
            },
          ],
        },
      ],
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
      options: [selectSize("chotall")],
    });

    expect(cart.menus).toHaveLength(2);
    const fingerprints = cart.menus.map((m) => m.fingerprint);
    expect(new Set(fingerprints).size).toBe(2);
  });

  it("같은 선택을 배열 순서만 바꿔 보내도 같은 항목으로 병합된다", async () => {
    const session = sessionFixture();
    const shot = {
      optionId: "optshot",
      choices: [{ choiceId: "choshot", quantity: 1 }],
    };

    await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      options: [selectSize("cholarge"), shot],
    });
    const { cart, meta } = await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      options: [shot, selectSize("cholarge")],
    });

    expect(cart.menus).toHaveLength(1);
    expect(cart.menus[0].quantity).toBe(2);
    expect(meta.isMerged).toBe(true);
  });

  it("같은 선택지라도 수량이 다르면 별도 항목이다", async () => {
    const session = sessionFixture();
    const withShots = (quantity: number) => ({
      menuPublicId: "menu-americano",
      quantity: 1,
      options: [
        selectSize("cholarge"),
        { optionId: "optshot", choices: [{ choiceId: "choshot", quantity }] },
      ],
    });

    await service.addItem(session, withShots(1));
    const { cart } = await service.addItem(session, withShots(2));

    // 샷 2개는 1개와 다른 상품이다 — 합쳐지면 결제 금액이 어긋난다.
    expect(cart.menus).toHaveLength(2);
    expect(cart.menus.map((m) => m.optionsPrice)).toEqual([800, 1100]);
  });

  it("복수 선택은 선택지별 priceDelta × 수량을 모두 합산한다", async () => {
    const session = sessionFixture();
    const { cart } = await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      options: [
        selectSize("cholarge"),
        {
          optionId: "optshot",
          choices: [
            { choiceId: "choshot", quantity: 3 },
            { choiceId: "chosyrup", quantity: 1 },
          ],
        },
      ],
    });

    // 라지 500 + 샷 300 × 3 + 시럽 200
    expect(cart.menus[0].optionsPrice).toBe(1600);
    expect(cart.menus[0].unitPrice).toBe(4600);
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
      options: [selectSize("chotall")],
    });

    expect(cart.menus[0]).toMatchObject({
      quantity: 5,
      optionsPrice: 0,
      unitPrice: 3000,
    });
    expect(cart.menus[0].options?.[0].choices[0].choiceId).toBe("chotall");
  });

  it("변경 결과가 다른 아이템과 같은 조합이 되면 하나로 병합한다", async () => {
    const session = sessionFixture();
    const { cart: first } = await service.addItem(session, americanoPayload(2));
    const tallItem = await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      options: [selectSize("chotall")],
    });
    const tallItemId = tallItem.cart.menus.find(
      (m) => m.id !== first.menus[0].id
    )!.id;

    // 톨 → 라지로 변경하면 기존 라지 아이템과 병합돼야 한다
    const { cart, meta } = await service.updateItem(session, tallItemId, {
      options: [selectSize("cholarge")],
    });

    expect(cart.menus).toHaveLength(1);
    expect(cart.menus[0].quantity).toBe(3);
    expect(meta.isMerged).toBe(true);
  });

  /**
   * 조건이 되는 그룹을 바꾸는 한 번의 요청으로 끝나야 한다. 저장된 선택까지 400으로 막으면
   * 손님이 "얼음을 먼저 비우고 → 종류를 바꾸는" 두 단계를 밟아야 한다.
   */
  it("조건이 되는 그룹을 바꾸면 조건이 깨진 그룹의 저장된 선택은 조용히 빠진다", async () => {
    const iceGroup: OptionGroup = {
      ...SHOT_GROUP,
      publicId: "opticecube",
      name: "얼음",
      selectionType: OptionSelectionType.SINGLE,
      maxSelect: 1,
      sortOrder: 30,
      // 사이즈가 라지일 때만 노출된다.
      trigger: [{ optionId: "optsize", choiceIds: ["cholarge"] }],
      choices: [
        {
          publicId: "choiceless",
          name: "얼음 적게",
          priceDelta: 100,
          quantityEnabled: false,
          maxQuantity: 1,
          isDefault: false,
          sortOrder: 10,
          state: OptionChoiceState.AVAILABLE,
        },
      ],
    };
    prismaMock.menu.findFirstOrThrow.mockResolvedValue(
      menuFixture({ options: [SIZE_GROUP, iceGroup] })
    );

    const session = sessionFixture();
    const { cart: added } = await service.addItem(session, {
      menuPublicId: "menu-americano",
      quantity: 1,
      options: [
        selectSize("cholarge"),
        {
          optionId: "opticecube",
          choices: [{ choiceId: "choiceless", quantity: 1 }],
        },
      ],
    });
    const itemId = added.menus[0].id;

    // 라지 → 톨. 얼음은 페이로드에 없지만 저장된 선택으로 병합돼 딸려온다.
    const { cart } = await service.updateItem(session, itemId, {
      options: [selectSize("chotall")],
    });

    expect(cart.menus[0].options?.map((group) => group.optionId)).toEqual([
      "optsize",
    ]);
    expect(cart.menus[0].optionsPrice).toBe(0);
    expect(cart.menus[0].unitPrice).toBe(3000);
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
      options: [selectSize("chotall")],
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

  it("같은 dedupeKey의 중복 요청은 차감하지 않는다 — 중복 차감 방지", async () => {
    const session = sessionFixture();
    // 실제로는 주문 idempotencyKey — 테스트에선 정리 편의상 sessionToken 사용
    const dedupeKey = session.sessionToken;

    // 주문 스냅샷: 라지 2개 (중복 요청 A·B가 이 스냅샷을 공유한다)
    const { cart: snapshot } = await service.addItem(
      session,
      americanoPayload(2)
    );
    const orderedItems = snapshot.menus.map((m) => ({
      id: m.id,
      quantity: m.quantity,
    }));

    // 다른 기기가 같은 항목을 +1 담아 기존 item id에 병합된 상태(수량 3)에서
    // 요청 A와 B가 같은 스냅샷(2개)으로 각각 차감을 시도한다
    await service.addItem(session, americanoPayload(1));
    await service.removeOrderedItems(session, orderedItems, dedupeKey);
    await service.removeOrderedItems(session, orderedItems, dedupeKey);

    // 수정 전엔 B가 스냅샷 기준 2개를 다시 차감해 남은 1개까지 사라졌다
    const cart = await service.getCart(session.sessionToken);
    expect(cart.menus).toHaveLength(1);
    expect(cart.menus[0].quantity).toBe(1);
  });

  it("dedupeKey가 없으면 기존처럼 호출마다 차감한다", async () => {
    const session = sessionFixture();
    const { cart: snapshot } = await service.addItem(
      session,
      americanoPayload(2)
    );
    const orderedItems = snapshot.menus.map((m) => ({ id: m.id, quantity: 1 }));

    await service.removeOrderedItems(session, orderedItems);
    await service.removeOrderedItems(session, orderedItems);

    expect(await redis.exists(`cart:${session.sessionToken}`)).toBe(0);
  });

  it("차감 기록의 TTL은 세션 만료에 맞춰진다", async () => {
    const session = sessionFixture();
    const dedupeKey = session.sessionToken;
    const { cart } = await service.addItem(session, americanoPayload(2));

    await service.removeOrderedItems(
      session,
      cart.menus.map((m) => ({ id: m.id, quantity: m.quantity })),
      dedupeKey
    );

    const markerTtl = await redis.ttl(`cart:deducted:${dedupeKey}`);
    expect(markerTtl).toBeGreaterThan(0);
    expect(markerTtl).toBeLessThanOrEqual(60 * 60); // 세션 만료(1시간) 이내
  });

  it("남은 장바구니 TTL은 전달된 세션의 최신 expiresAt으로 계산된다", async () => {
    const session = sessionFixture();
    const { cart } = await service.addItem(session, americanoPayload(3));
    const orderedItems = cart.menus.map((m) => ({ id: m.id, quantity: 1 }));

    // 주문 생성 중 세션이 활성화돼 만료가 2시간으로 연장된 상황
    // (orders.service는 생성 결과의 tableSession.expiresAt을 넘긴다)
    const refreshedSession = {
      ...session,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    };

    await service.removeOrderedItems(refreshedSession, orderedItems);

    // 수정 전엔 활성화 이전 expiresAt(1시간) 기준으로 짧게 저장됐다
    const cartTtl = await redis.ttl(`cart:${session.sessionToken}`);
    expect(cartTtl).toBeGreaterThan(60 * 60);
    expect(cartTtl).toBeLessThanOrEqual(2 * 60 * 60);
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
