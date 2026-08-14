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

  it("인덱스가 비어 있으면 Redis를 더 두드리지 않는다", async () => {
    redis.zrevrange.mockResolvedValue([]);

    expect(await store.list(SCOPE)).toEqual([]);
    expect(redis.pipeline).not.toHaveBeenCalled();
  });
});

describe("MenuDraftStore — 수정", () => {
  it("만료된 초안을 수정으로 되살리지 않는다", async () => {
    // HSET은 없는 키를 만들어 버린다 — 항목만 있고 사진·추출 정보가 없는 반쪽이 남는다.
    redis.exists.mockResolvedValue(0);

    expect(await store.replaceItems(SCOPE, DRAFT_ID, [ITEM])).toBeNull();
    expect(redis.multi).not.toHaveBeenCalled();
  });
});
