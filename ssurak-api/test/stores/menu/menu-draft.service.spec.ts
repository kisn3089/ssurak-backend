import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import {
  HttpException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Redis } from "ioredis";
import type { Category, Owner } from "@ssurak/db";
import type {
  MenuDraftItem,
  MenuDraftResponse,
  MenuDraftSummary,
  MenuExtraction,
} from "@ssurak/schema";
import { PrismaService } from "src/prisma/prisma.service";
import {
  MenuDraftService,
  type DraftImageUpload,
} from "src/stores/menu/menu-draft.service";
import {
  MenuDraftStore,
  type StoredMenuDraft,
} from "src/stores/menu/menu-draft.store";
import { MenuVisionClient } from "src/stores/menu/menu-vision.client";
import sharp from "sharp";

const STORE_ID = "store-public-id";
const RATE_LIMIT = 15;
const RATE_WINDOW_HOURS = 8;
/** 상한은 매장이 아니라 점주 단위다. 키에 storeId가 들어가지 않는다. */
const RATE_KEY = "menu-draft:rate:owner-public-id";

const OWNER: Owner = {
  id: 7n,
  publicId: "owner-public-id",
  email: "owner@ssurak.dev",
  password: "hashed",
  name: "점주",
  phone: "01000000000",
  businessNumber: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** loadCategories는 publicId·name만 select하지만, mock의 타입은 행 전체를 요구한다. */
const CATEGORY_ROW: Category = {
  id: 11n,
  publicId: "cat-1",
  storeId: 1n,
  name: "찌개류",
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const EXTRACTION: MenuExtraction = {
  items: [
    {
      name: "김치찌개",
      price: 9000,
      description: null,
      categoryName: "찌개류",
    },
  ],
  unreadableCount: 0,
};

/** OCR 전처리를 통과할 수 있는 최소 크기의 실제 JPEG. */
const menuPhoto = (): Promise<Buffer> =>
  sharp({
    create: {
      width: 1000,
      height: 800,
      channels: 3,
      background: { r: 250, g: 250, b: 250 },
    },
  })
    .jpeg()
    .toBuffer();

const uploads = async (): Promise<DraftImageUpload[]> => [
  { buffer: await menuPhoto(), fileName: "menu.jpg", byteSize: 12_345 },
];

const prisma = mockDeep<PrismaService>();
const vision = mockDeep<MenuVisionClient>();
const store = mockDeep<MenuDraftStore>();
const redis = mockDeep<Redis>();
const config = mockDeep<ConfigService>();

/**
 * 레이트리밋은 MULTI로 나간다. ioredis의 트랜잭션은 명령을 체이닝하고 `exec`에서
 * `[error, value][]`를 돌려주는데, mockDeep은 이 체이닝을 흉내 내지 못해 직접 만든다.
 */
const rateLimitTransaction = () => {
  const chain = {
    incr: vi.fn(() => chain),
    expire: vi.fn(() => chain),
    get: vi.fn(() => chain),
    ttl: vi.fn(() => chain),
    exec: vi.fn(),
  };
  return chain;
};

let transaction: ReturnType<typeof rateLimitTransaction>;

/** `exec`가 돌려주는 "이번 요청까지 포함한 사용 횟수". */
const usedCount = (used: number) =>
  transaction.exec.mockResolvedValue([
    [null, used],
    [null, 1],
  ]);

/** 조회 경로의 `exec`. GET은 문자열(없으면 null), TTL은 남은 초. */
const rateState = (counter: string | null, ttlSeconds: number) =>
  transaction.exec.mockResolvedValue([
    [null, counter],
    [null, ttlSeconds],
  ]);

/** 저장된 초안의 항목 하나. 재사용 경로가 표시를 다시 계산하는 대상이다. */
const DRAFT_ITEM: MenuDraftItem = {
  name: "김치찌개",
  price: 9000,
  description: null,
  category: { kind: "existing", categoryId: "cat-1", name: "찌개류" },
  issues: [],
};

const savedDraft = (draft: StoredMenuDraft): MenuDraftResponse => ({
  ...draft,
  itemCount: draft.items.length,
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
});

// 상한은 생성자에서 한 번 읽힌다. 인스턴스를 모듈 로드 시점에 만들면
// config mock이 세팅되기 전 값이 굳어버리므로 매 테스트마다 새로 만든다.
let service: MenuDraftService;

beforeEach(() => {
  vi.clearAllMocks();

  config.getOrThrow.mockImplementation((key: string) =>
    key === "MENU_DRAFT_RATE_LIMIT" ? RATE_LIMIT : RATE_WINDOW_HOURS
  );
  service = new MenuDraftService(prisma, vision, store, redis, config);

  transaction = rateLimitTransaction();
  redis.multi.mockReturnValue(transaction as never);
  usedCount(1);

  prisma.category.findMany.mockResolvedValue([CATEGORY_ROW]);
  prisma.menu.findMany.mockResolvedValue([]);

  vision.extract.mockResolvedValue(EXTRACTION);

  store.findOrFailure.mockResolvedValue(null);
  store.save.mockImplementation((_scope, draft) =>
    Promise.resolve(savedDraft(draft))
  );
  // 재사용 경로가 갱신한 표시를 다시 저장한다. 저장된 모양 그대로 응답에 실린다.
  store.replaceItems.mockImplementation((_scope, draftId, items) =>
    Promise.resolve(
      savedDraft({
        draftId,
        status: "READY",
        items,
        unreadableCount: 0,
        sourceImages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    )
  );
  store.saveFailure.mockResolvedValue(undefined);
});

describe("MenuDraftService — 추출", () => {
  it("인식 결과를 초안으로 돌려주고 DB에는 쓰지 않는다", async () => {
    const draft = await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      name: "김치찌개",
      price: 9000,
      category: { kind: "existing", categoryId: "cat-1" },
    });
    expect(draft.status).toBe("READY");
    expect(prisma.menu.create).not.toHaveBeenCalled();
    expect(prisma.menu.createMany).not.toHaveBeenCalled();
  });

  it("매장의 기존 카테고리 이름을 프롬프트 힌트로 넘긴다", async () => {
    await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(vision.extract).toHaveBeenCalledWith(expect.anything(), ["찌개류"]);
  });

  it("원본이 아니라 썸네일만 저장한다", async () => {
    await service.createDraft(OWNER, STORE_ID, await uploads());

    const [, draft] = store.save.mock.calls[0];
    expect(draft.sourceImages).toEqual([
      {
        fileName: "menu.jpg",
        byteSize: 12_345,
        thumbnail: expect.stringMatching(/^data:image\/webp;base64,/),
      },
    ]);
  });

  it("초안 ID는 매장·사진이 같으면 같고 다르면 다르다", async () => {
    const photo = await uploads();

    await service.createDraft(OWNER, STORE_ID, photo);
    await service.createDraft(OWNER, STORE_ID, photo);

    const [first, second] = store.save.mock.calls.map(([, draft]) => draft);
    expect(first.draftId).toBe(second.draftId);
    expect(first.draftId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("중복 판정 대상에서 소프트 삭제된 메뉴를 제외한다", async () => {
    await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(prisma.menu.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
  });

  it("저장에 실패해도 이미 지불한 인식 결과는 돌려준다", async () => {
    store.save.mockRejectedValue(new Error("redis down"));

    const draft = await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(draft.items).toHaveLength(1);
    expect(draft.expiresAt).toBeTruthy();
  });
});

describe("MenuDraftService — 재사용", () => {
  it("같은 사진이면 저장된 초안을 주고 모델을 부르지 않는다", async () => {
    const existing = savedDraft({
      draftId: "AAAAAAAAAAAAAAAAAAAAAA",
      status: "READY",
      items: [DRAFT_ITEM],
      unreadableCount: 0,
      sourceImages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    store.findOrFailure.mockResolvedValue({ kind: "draft", draft: existing });

    const draft = await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(draft.draftId).toBe(existing.draftId);
    expect(draft.items).toMatchObject([{ name: "김치찌개", price: 9000 }]);
    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("이미 등록된 초안을 다시 올리면 중복 표시를 붙여 돌려준다", async () => {
    // 확정까지 끝낸 초안을 표시 없이 그대로 주면, 사장님이 한 번 더 확정해 메뉴가 두 벌 생긴다.
    prisma.menu.findMany.mockResolvedValue([{ name: "김치찌개" }] as never);
    store.findOrFailure.mockResolvedValue({
      kind: "draft",
      draft: savedDraft({
        draftId: "AAAAAAAAAAAAAAAAAAAAAA",
        status: "COMMITTED",
        items: [DRAFT_ITEM],
        unreadableCount: 0,
        sourceImages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    const draft = await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(draft.items[0].issues).toContain("DUPLICATE_NAME");
    expect(vision.extract).not.toHaveBeenCalled();
  });

  /**
   * 재사용은 읽기다. 저장하면 updatedAt이 밀려 "마지막 수정 시각"이 다시 올린 시각이 되고,
   * 저장해둔 표시도 그 뒤 매장이 바뀌면 어차피 낡는다. 내보내는 쪽이 매번 다시 푼다.
   */
  it("갱신한 표시를 저장하지는 않는다", async () => {
    prisma.menu.findMany.mockResolvedValue([{ name: "김치찌개" }] as never);
    store.findOrFailure.mockResolvedValue({
      kind: "draft",
      draft: savedDraft({
        draftId: "AAAAAAAAAAAAAAAAAAAAAA",
        status: "READY",
        items: [DRAFT_ITEM],
        unreadableCount: 0,
        sourceImages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    const draft = await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(draft.items[0].issues).toContain("DUPLICATE_NAME");
    expect(store.replaceItems).not.toHaveBeenCalled();
  });

  it("재사용은 인식 횟수를 차감하지 않는다", async () => {
    // 비용이 0인 요청에 할당량을 깎으면 리뷰 화면을 다시 여는 것만으로 손해를 본다.
    store.findOrFailure.mockResolvedValue({
      kind: "draft",
      draft: savedDraft({
        draftId: "AAAAAAAAAAAAAAAAAAAAAA",
        status: "READY",
        items: [],
        unreadableCount: 0,
        sourceImages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });

    await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(redis.multi).not.toHaveBeenCalled();
  });

  it("실패 기록이 남아 있으면 모델을 다시 부르지 않고 같은 이유로 거절한다", async () => {
    store.findOrFailure.mockResolvedValue({
      kind: "failure",
      reason: "사진에서 메뉴를 읽지 못했습니다.",
    });

    await expect(
      service.createDraft(OWNER, STORE_ID, await uploads())
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("메뉴를 읽지 못한 사진은 실패로 기록한다", async () => {
    vision.extract.mockRejectedValue(
      new UnprocessableEntityException("사진에서 메뉴를 읽지 못했습니다.")
    );

    await expect(
      service.createDraft(OWNER, STORE_ID, await uploads())
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(store.saveFailure).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: STORE_ID }),
      expect.any(String),
      "사진에서 메뉴를 읽지 못했습니다."
    );
  });

  it("업스트림 일시 장애는 실패로 기록하지 않는다", async () => {
    // 10분 동안 재시도를 막을 이유가 없다 — 다음 요청에 성공할 수 있는 실패다.
    vision.extract.mockRejectedValue(
      new HttpException("잠시 후 다시", HttpStatus.SERVICE_UNAVAILABLE)
    );

    await expect(
      service.createDraft(OWNER, STORE_ID, await uploads())
    ).rejects.toBeInstanceOf(HttpException);

    expect(store.saveFailure).not.toHaveBeenCalled();
  });

  it("초안 조회가 실패해도 추출로 넘어간다", async () => {
    store.findOrFailure.mockRejectedValue(new Error("redis down"));

    const draft = await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(draft.items).toHaveLength(1);
  });
});

describe("MenuDraftService — 조회·수정", () => {
  it("만료된 초안은 404로 알린다", async () => {
    store.find.mockResolvedValue(null);

    await expect(
      service.getDraft(OWNER, STORE_ID, "AAAAAAAAAAAAAAAAAAAAAA")
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("저장소 장애는 404가 아니라 503으로 구분한다", async () => {
    store.list.mockRejectedValue(new Error("redis down"));

    await expect(service.listDrafts(OWNER, STORE_ID)).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });

  /**
   * 일괄 등록을 마친 초안을 다시 열면 그 메뉴들은 이제 매장에 존재한다.
   * 저장된 issues는 추출 당시 값이라 깨끗한데, 그대로 보여주면 사장님이 또 확정해
   * 같은 메뉴가 두 벌 생긴다. POST 재사용·PATCH와 같은 기준으로 다시 계산해야 한다.
   */
  it("조회 시 issues를 지금 매장 기준으로 다시 계산한다", async () => {
    store.find.mockResolvedValue(
      savedDraft({
        draftId: "AAAAAAAAAAAAAAAAAAAAAA",
        status: "COMMITTED",
        // 추출 당시엔 매장에 없던 메뉴라 issues가 비어 있다.
        items: [DRAFT_ITEM],
        unreadableCount: 0,
        sourceImages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
    // 그 사이 일괄 등록이 끝나 같은 이름이 매장에 생겼다.
    prisma.menu.findMany.mockResolvedValue([{ name: "김치찌개" }] as never);

    const draft = await service.getDraft(
      OWNER,
      STORE_ID,
      "AAAAAAAAAAAAAAAAAAAAAA"
    );

    expect(draft.items[0].issues).toContain("DUPLICATE_NAME");
  });

  /** 조회는 읽기다. 다시 계산했다고 저장까지 하면 updatedAt이 열어본 시각이 된다. */
  it("조회는 다시 계산한 결과를 저장하지 않는다", async () => {
    store.find.mockResolvedValue(
      savedDraft({
        draftId: "AAAAAAAAAAAAAAAAAAAAAA",
        status: "READY",
        items: [DRAFT_ITEM],
        unreadableCount: 0,
        sourceImages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );

    await service.getDraft(OWNER, STORE_ID, "AAAAAAAAAAAAAAAAAAAAAA");

    expect(store.replaceItems).not.toHaveBeenCalled();
  });

  it("수정 시 issues를 다시 계산한다", async () => {
    store.replaceItems.mockImplementation((_scope, draftId, items) =>
      Promise.resolve(
        savedDraft({
          draftId,
          status: "READY",
          items,
          unreadableCount: 0,
          sourceImages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      )
    );

    const updated = await service.updateDraftItems(
      OWNER,
      STORE_ID,
      "AAAAAAAAAAAAAAAAAAAAAA",
      {
        items: [
          { name: "김치찌개", price: 9000, categoryId: "cat-1" },
          { name: "된장찌개", price: null },
        ],
      }
    );

    // 가격을 채운 행에서는 표시가 사라지고, 비운 행에는 남는다.
    expect(updated.items[0].issues).toEqual([]);
    expect(updated.items[0].category).toEqual({
      kind: "existing",
      categoryId: "cat-1",
      name: "찌개류",
    });
    expect(updated.items[1].issues).toEqual(
      expect.arrayContaining(["CATEGORY_UNKNOWN", "PRICE_MISSING"])
    );
  });

  it("이 매장에 없는 카테고리로는 수정할 수 없다", async () => {
    await expect(
      service.updateDraftItems(OWNER, STORE_ID, "AAAAAAAAAAAAAAAAAAAAAA", {
        items: [{ name: "김치찌개", price: 9000, categoryId: "cat-other" }],
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(store.replaceItems).not.toHaveBeenCalled();
  });

  it("이미 만료된 초안에 대한 수정은 404다 — 되살리지 않는다", async () => {
    store.replaceItems.mockResolvedValue(null);

    await expect(
      service.updateDraftItems(OWNER, STORE_ID, "AAAAAAAAAAAAAAAAAAAAAA", {
        items: [],
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/**
 * 남은 횟수는 목록에 얹어 보내는 부가 정보다. 8시간 고정 창이라 "몇 번 남았나"만으로는
 * 부족하고 언제 풀리는지까지 있어야 사장님이 기다릴지 말지 정할 수 있다.
 */
describe("MenuDraftService — 목록의 남은 횟수", () => {
  const DRAFT_SUMMARY: MenuDraftSummary = {
    draftId: "AAAAAAAAAAAAAAAAAAAAAA",
    status: "READY",
    itemCount: 1,
    sourceImages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  };

  // clearAllMocks는 구현을 지우지 않아 앞 테스트의 mockRejectedValue가 남는다.
  beforeEach(() => store.list.mockResolvedValue([]));

  it("남은 횟수와 초기화 시각을 함께 내려준다", async () => {
    rateState("3", 2 * 60 * 60);

    const before = Date.now();
    const { remaining, resetAt } = await service.listDrafts(OWNER, STORE_ID);

    // 차감할 때와 같은 키를 읽어야 표시와 실제가 갈라지지 않는다.
    expect(transaction.get).toHaveBeenCalledWith(RATE_KEY);
    expect(transaction.ttl).toHaveBeenCalledWith(RATE_KEY);
    expect(remaining).toBe(RATE_LIMIT - 3);
    expect(Date.parse(resetAt as string)).toBeGreaterThanOrEqual(
      before + 2 * 60 * 60 * 1000
    );
  });

  it("아직 쓰지 않았으면 상한이 그대로 남고 초기화 시각은 없다", async () => {
    // 키가 없으면 GET은 null, TTL은 -2다.
    rateState(null, -2);

    await expect(service.listDrafts(OWNER, STORE_ID)).resolves.toMatchObject({
      remaining: RATE_LIMIT,
      resetAt: null,
    });
  });

  it("상한을 넘겨 썼어도 음수로 내려가지 않는다", async () => {
    rateState(String(RATE_LIMIT + 5), 60);

    await expect(service.listDrafts(OWNER, STORE_ID)).resolves.toMatchObject({
      remaining: 0,
    });
  });

  /**
   * 부가 정보 하나 때문에 목록 전체를 막으면 안 된다. 컨트롤러가 응답을 스키마로
   * parse하므로 NaN이나 undefined가 새어 나가면 목록이 통째로 500이 된다.
   */
  it("카운터를 못 읽어도 목록은 그대로 보여준다", async () => {
    transaction.exec.mockRejectedValue(new Error("redis down"));
    store.list.mockResolvedValue([DRAFT_SUMMARY]);

    await expect(service.listDrafts(OWNER, STORE_ID)).resolves.toEqual({
      drafts: [DRAFT_SUMMARY],
      remaining: null,
      resetAt: null,
    });
  });

  it("카운터 값이 숫자가 아니면 목록만 남기고 null로 접는다", async () => {
    rateState("nonsense", 60);

    await expect(service.listDrafts(OWNER, STORE_ID)).resolves.toMatchObject({
      remaining: null,
      resetAt: null,
    });
  });
});

describe("MenuDraftService — 레이트리밋", () => {
  it("상한을 넘으면 429로 거절하고 모델을 부르지 않는다", async () => {
    usedCount(RATE_LIMIT + 1);

    await expect(
      service.createDraft(OWNER, STORE_ID, await uploads())
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("상한과 같은 횟수까지는 통과한다", async () => {
    usedCount(RATE_LIMIT);

    await expect(
      service.createDraft(OWNER, STORE_ID, await uploads())
    ).resolves.toBeDefined();
  });

  /**
   * INCR과 EXPIRE가 갈라지면 그 사이에 죽은 프로세스가 TTL 없는 카운터를 남기고,
   * 그 매장은 상한을 채운 뒤 영영 인식을 못 하게 된다. 한 트랜잭션으로 나가는지 고정한다.
   */
  it("카운터와 TTL을 한 번의 트랜잭션으로 보낸다", async () => {
    await service.createDraft(OWNER, STORE_ID, await uploads());

    expect(transaction.exec).toHaveBeenCalledTimes(1);
    expect(transaction.incr).toHaveBeenCalledWith(RATE_KEY);
    // NX가 빠지면 매 요청이 만료를 미뤄 창이 영원히 안 닫힌다(슬라이딩이 돼 버린다).
    expect(transaction.expire).toHaveBeenCalledWith(
      RATE_KEY,
      RATE_WINDOW_HOURS * 60 * 60,
      "NX"
    );
  });

  /**
   * 점주 단위 상한이다. 매장별로 쪼개면 매장을 늘리는 것만으로 총량을 늘릴 수 있어
   * 상한이 비용을 못 막는다. 키에 storeId가 끼어드는 순간 그렇게 된다.
   */
  it("매장이 달라도 같은 카운터를 쓴다", async () => {
    await service.createDraft(OWNER, "other-store-id", await uploads());

    expect(transaction.incr).toHaveBeenCalledWith(RATE_KEY);
  });

  it("TTL을 걸지 못하면 통과시키지 않는다", async () => {
    // 여기서 눈감으면 만료 없는 카운터가 남아 점주가 조용히 영구 차단된다.
    transaction.exec.mockResolvedValue([
      [null, 1],
      [new Error("ERR wrong number of arguments"), null],
    ]);

    await expect(
      service.createDraft(OWNER, STORE_ID, await uploads())
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });

    expect(vision.extract).not.toHaveBeenCalled();
  });

  it("Redis가 죽으면 열어두지 않고 503으로 닫는다", async () => {
    // fail-open으로 두면 Redis 장애가 그대로 무제한 유료 호출이 된다.
    transaction.exec.mockRejectedValue(new Error("redis down"));

    await expect(
      service.createDraft(OWNER, STORE_ID, await uploads())
    ).rejects.toBeInstanceOf(HttpException);

    expect(vision.extract).not.toHaveBeenCalled();
  });
});
