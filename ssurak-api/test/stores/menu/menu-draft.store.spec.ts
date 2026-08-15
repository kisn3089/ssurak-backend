import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { Redis } from "ioredis";
import type { MenuDraftItem } from "@ssurak/schema";
import {
  DRAFT_TTL_SECONDS,
  MenuDraftStore,
  type DraftScope,
} from "src/stores/menu/menu-draft.store";

const SCOPE: DraftScope = { ownerPublicId: "owner-1", storeId: "store-1" };
const DRAFT_ID = "AAAAAAAAAAAAAAAAAAAAAA";
const DRAFT_KEY = `menu-draft:${SCOPE.ownerPublicId}:${SCOPE.storeId}:${DRAFT_ID}`;
const INDEX_KEY = `menu-draft:index:${SCOPE.ownerPublicId}:${SCOPE.storeId}`;

const ITEM: MenuDraftItem = {
  name: "김치찌개",
  price: 9000,
  description: null,
  category: { kind: "unknown" },
  issues: [],
};

const NOW = new Date().toISOString();

/** Redis Hash에 실제로 들어가는 모양(전부 문자열). */
const fields = (overrides: Record<string, string> = {}) => ({
  status: "READY",
  items: JSON.stringify([ITEM]),
  itemCount: "1",
  unreadableCount: "0",
  sourceImages: "[]",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

/**
 * ioredis의 파이프라인은 명령을 체이닝하고 `exec`에서 `[error, value][]`를 돌려준다.
 * mockDeep은 이 체이닝을 흉내 내지 못하므로 직접 만든다.
 */
const chainMock = () => {
  const chain: Record<string, unknown> = {};
  const commands = [
    "hgetall",
    "pttl",
    "get",
    "hmget",
    "hset",
    "expire",
    "zadd",
  ];

  for (const command of commands) {
    chain[command] = vi.fn(() => chain);
  }
  chain.exec = vi.fn().mockResolvedValue([]);

  return chain as Record<string, ReturnType<typeof vi.fn>> & {
    exec: ReturnType<typeof vi.fn>;
  };
};

const redis = mockDeep<Redis>();
let pipeline: ReturnType<typeof chainMock>;
let store: MenuDraftStore;

beforeEach(() => {
  vi.clearAllMocks();

  pipeline = chainMock();
  redis.pipeline.mockReturnValue(pipeline as never);
  redis.multi.mockReturnValue(chainMock() as never);

  store = new MenuDraftStore(redis);
});

describe("MenuDraftStore — 조회", () => {
  it("살아 있는 초안은 만료 시각과 함께 돌려준다", async () => {
    pipeline.exec.mockResolvedValue([
      [null, fields()],
      [null, 60_000],
      [null, null],
    ]);

    const found = await store.findOrFailure(SCOPE, DRAFT_ID);

    expect(found).toMatchObject({ kind: "draft" });
    expect(found?.kind === "draft" && found.draft.items).toEqual([ITEM]);
    expect(found?.kind === "draft" && found.draft.expiresAt).toBeTruthy();
  });

  it("조회할 때마다 만료를 뒤로 민다", async () => {
    const touch = chainMock();
    redis.multi.mockReturnValue(touch as never);
    pipeline.exec.mockResolvedValue([
      [null, fields()],
      [null, 60_000],
      [null, null],
    ]);

    await store.findOrFailure(SCOPE, DRAFT_ID);

    expect(touch.expire).toHaveBeenCalledWith(DRAFT_KEY, DRAFT_TTL_SECONDS);
    expect(touch.expire).toHaveBeenCalledWith(INDEX_KEY, DRAFT_TTL_SECONDS);
  });

  it("초안이 없고 실패 기록만 있으면 실패로 알린다", async () => {
    pipeline.exec.mockResolvedValue([
      [null, {}],
      [null, -2],
      [null, "메뉴를 읽지 못했습니다."],
    ]);

    const found = await store.findOrFailure(SCOPE, DRAFT_ID);

    expect(found).toEqual({
      kind: "failure",
      reason: "메뉴를 읽지 못했습니다.",
    });
  });

  it("PTTL이 숫자가 아니면 만료 시각을 지어내지 않는다", async () => {
    // 문자열 "60000"은 `<= 0` 비교를 통과해 버린다. 검증 없이 number로 믿으면
    // Date.now() + "60000"이 문자열로 붙어 Invalid Date가 되고 toISOString이 터진다.
    pipeline.exec.mockResolvedValue([
      [null, fields()],
      [null, "60000"],
      [null, null],
    ]);

    expect(await store.findOrFailure(SCOPE, DRAFT_ID)).toBeNull();
  });

  it("계약이 바뀌어 모양이 안 맞는 값은 없는 것으로 친다", async () => {
    pipeline.exec.mockResolvedValue([
      [null, fields({ items: "not-json" })],
      [null, 60_000],
      [null, null],
    ]);

    expect(await store.find(SCOPE, DRAFT_ID)).toBeNull();
  });
});

describe("MenuDraftStore — 목록", () => {
  beforeEach(() => {
    redis.zrevrange.mockResolvedValue([DRAFT_ID, "BBBBBBBBBBBBBBBBBBBBBB"]);
    redis.zrem.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
  });

  it("무거운 items를 읽지 않는다", async () => {
    pipeline.exec.mockResolvedValue([
      [null, ["READY", "1", "[]", NOW, NOW]],
      [null, 60_000],
      [null, ["READY", "2", "[]", NOW, NOW]],
      [null, 60_000],
    ]);

    await store.list(SCOPE);

    const requestedFields = pipeline.hmget.mock.calls[0].slice(1);
    expect(requestedFields).not.toContain("items");
    expect(requestedFields).toContain("itemCount");
  });

  it("값이 먼저 만료된 인덱스 멤버는 응답에서 빼고 지운다", async () => {
    // ZSET 멤버는 값 키와 함께 사라지지 않는다. 여기서 치우지 않으면 계속 쌓인다.
    pipeline.exec.mockResolvedValue([
      [null, ["READY", "1", "[]", NOW, NOW]],
      [null, 60_000],
      [null, [null, null, null, null, null]],
      [null, -2],
    ]);

    const drafts = await store.list(SCOPE);

    expect(drafts.map((draft) => draft.draftId)).toEqual([DRAFT_ID]);
    expect(redis.zrem).toHaveBeenCalledWith(
      INDEX_KEY,
      "BBBBBBBBBBBBBBBBBBBBBB"
    );
  });

  it("한 초안의 응답이 깨져도 나머지 목록은 살린다", async () => {
    pipeline.exec.mockResolvedValue([
      [null, ["READY", "1", "[]", NOW, NOW]],
      [null, 60_000],
      [null, "배열이 아님"],
      [null, null],
    ]);

    const drafts = await store.list(SCOPE);

    expect(drafts.map((draft) => draft.draftId)).toEqual([DRAFT_ID]);
  });

  it("인덱스가 비어 있으면 Redis를 더 두드리지 않는다", async () => {
    redis.zrevrange.mockResolvedValue([]);

    expect(await store.list(SCOPE)).toEqual([]);
    expect(redis.pipeline).not.toHaveBeenCalled();
  });
});

describe("MenuDraftStore — 수정", () => {
  it("만료된 초안을 수정으로 되살리지 않는다", async () => {
    // HSET은 없는 키를 만들어 버린다 — 항목만 있고 사진·추출 정보가 없는 반쪽이 남는다.
    redis.eval.mockResolvedValue(0);

    expect(await store.replaceItems(SCOPE, DRAFT_ID, [ITEM])).toBeNull();
    expect(redis.pipeline).not.toHaveBeenCalled();
  });

  it("확인과 쓰기를 한 번에 실행해 만료 경합을 막는다", async () => {
    // exists → hset을 따로 보내면 그 사이에 TTL이 지날 수 있다.
    redis.eval.mockResolvedValue(1);
    pipeline.exec.mockResolvedValue([
      [null, fields()],
      [null, 60_000],
      [null, null],
    ]);

    await store.replaceItems(SCOPE, DRAFT_ID, [ITEM]);

    const [script, keyCount, draftKey, indexKey, ttl, ...pairs] =
      redis.eval.mock.calls[0];
    expect(script).toContain("EXISTS");
    expect([keyCount, draftKey, indexKey, ttl]).toEqual([
      2,
      DRAFT_KEY,
      INDEX_KEY,
      String(DRAFT_TTL_SECONDS),
    ]);
    expect(pairs).toContain("items");
    expect(redis.exists).not.toHaveBeenCalled();
  });

  it("만료된 초안을 커밋 표시로 되살리지 않는다", async () => {
    // 이 경로는 expire가 없었다 — 되살아나면 TTL 없는 키가 영영 남는다.
    redis.eval.mockResolvedValue(0);

    await store.markCommitted(SCOPE, DRAFT_ID);

    expect(redis.hset).not.toHaveBeenCalled();
  });

  it("커밋된 초안도 같은 경로로 만료를 다시 건다", async () => {
    redis.eval.mockResolvedValue(1);

    await store.markCommitted(SCOPE, DRAFT_ID);

    const [, , , , ttl, ...pairs] = redis.eval.mock.calls[0];
    expect(ttl).toBe(String(DRAFT_TTL_SECONDS));
    expect(pairs).toEqual(
      expect.arrayContaining(["status", "COMMITTED", "updatedAt"])
    );
  });
});
