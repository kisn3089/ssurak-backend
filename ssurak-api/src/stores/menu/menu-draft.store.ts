import { Inject, Injectable, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import z from "zod";
import {
  menuDraftItemSchema,
  menuDraftSourceImageSchema,
  menuDraftStatusSchema,
  type MenuDraftItem,
  type MenuDraftResponse,
  type MenuDraftSummary,
} from "@ssurak/schema";
import { REDIS_CLIENT } from "src/redis/redis.provider";

/**
 * 초안 수명. "낮에 추출 → 저녁 장사 → 밤에 정리"와 "어젯밤 하다 말고 오늘 아침"이
 * 둘 다 커버되는 최소치다. 고정이 아니라 조회·수정할 때마다 다시 걸리는 슬라이딩이라
 * 편집 중에 만료되는 일이 없고, 그래서 숫자 자체의 민감도도 낮다.
 */
export const DRAFT_TTL_SECONDS = 12 * 60 * 60;

/** 실패 기록 수명. */
export const FAILURE_TTL_SECONDS = 10 * 60;

/** 목록에 실어 보내는 최대 개수. 12시간 안에 이보다 많이 찍는 경우는 없다고 본다. */
const LIST_MAX = 50;

export interface DraftScope {
  ownerPublicId: string;
  storeId: string;
}

export type StoredMenuDraft = Omit<
  MenuDraftResponse,
  "expiresAt" | "itemCount"
>;

const draftKeyOf = (scope: DraftScope, draftId: string): string =>
  `menu-draft:${scope.ownerPublicId}:${scope.storeId}:${draftId}`;

const failureKeyOf = (scope: DraftScope, draftId: string): string =>
  `menu-draft:failed:${scope.ownerPublicId}:${scope.storeId}:${draftId}`;

const indexKeyOf = (scope: DraftScope): string =>
  `menu-draft:index:${scope.ownerPublicId}:${scope.storeId}`;

const FIELDS = {
  status: "status",
  items: "items",
  itemCount: "itemCount",
  unreadableCount: "unreadableCount",
  sourceImages: "sourceImages",
  categories: "categories",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

/** 목록은 이 필드만 읽는다 — 제일 무거운 `items`를 건너뛰는 게 목록/상세를 나눈 이유다. */
const SUMMARY_FIELDS = [
  FIELDS.status,
  FIELDS.itemCount,
  FIELDS.sourceImages,
  FIELDS.createdAt,
  FIELDS.updatedAt,
] as const;

const isoSchema = z.string().datetime();
const countSchema = z.coerce.number().int().min(0);

/** 살아 있는 초안에만 쓰고 만료를 다시 건다. 키가 없으면 아무것도 하지 않고 0. */
const WRITE_IF_ALIVE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('HSET', KEYS[1], unpack(ARGV, 2))
redis.call('EXPIRE', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[1])
return 1
`;

/** 메뉴 초안의 Redis 계층 */
@Injectable()
export class MenuDraftStore {
  private readonly logger = new Logger(MenuDraftStore.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async findOrFailure(
    scope: DraftScope,
    draftId: string
  ): Promise<
    | { kind: "draft"; draft: MenuDraftResponse }
    | { kind: "failure"; reason: string }
    | null
  > {
    const replies = await this.redis
      .pipeline()
      .hgetall(draftKeyOf(scope, draftId))
      .pttl(draftKeyOf(scope, draftId))
      .get(failureKeyOf(scope, draftId))
      .exec();

    const fields = replyAt<Record<string, string>>(replies, 0) ?? {};
    const failure = replyAt<string>(replies, 2);
    const pttl = replyAt<number>(replies, 1) ?? -2;

    const draft = this.toDraft(draftId, fields, pttl);
    if (draft) {
      await this.extendExpires(scope, draftId);
      return {
        kind: "draft",
        draft: { ...draft, expiresAt: expiresAtFrom(DRAFT_TTL_SECONDS * 1000) },
      };
    }

    if (failure) return { kind: "failure", reason: failure };

    return null;
  }

  async find(
    scope: DraftScope,
    draftId: string
  ): Promise<MenuDraftResponse | null> {
    const found = await this.findOrFailure(scope, draftId);
    return found?.kind === "draft" ? found.draft : null;
  }

  async list(scope: DraftScope): Promise<MenuDraftSummary[]> {
    const indexKey = indexKeyOf(scope);
    const draftIds = await this.redis.zrevrange(indexKey, 0, LIST_MAX - 1);
    if (draftIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const draftId of draftIds) {
      const key = draftKeyOf(scope, draftId);
      pipeline.hmget(key, ...SUMMARY_FIELDS);
      pipeline.pttl(key);
    }
    const replies = await pipeline.exec();

    const summaries: MenuDraftSummary[] = [];
    const expired: string[] = [];

    draftIds.forEach((draftId, order) => {
      const values = replyAt<(string | null)[]>(replies, order * 2) ?? [];
      const pttl = replyAt<number>(replies, order * 2 + 1) ?? -2;

      const summary = this.toSummary(
        draftId,
        zip(SUMMARY_FIELDS, values),
        pttl
      );
      if (summary) summaries.push(summary);
      else expired.push(draftId);
    });

    if (expired.length > 0) {
      await this.redis.zrem(indexKey, ...expired);
    }
    await this.redis.expire(indexKey, DRAFT_TTL_SECONDS);

    return summaries;
  }

  async save(
    scope: DraftScope,
    draft: StoredMenuDraft,
    createdAt: Date
  ): Promise<MenuDraftResponse> {
    const key = draftKeyOf(scope, draft.draftId);
    const indexKey = indexKeyOf(scope);

    assertExecuted(
      await this.redis
        .multi()
        .hset(key, this.toFields(draft))
        .expire(key, DRAFT_TTL_SECONDS)
        .zadd(indexKey, createdAt.getTime(), draft.draftId)
        .expire(indexKey, DRAFT_TTL_SECONDS)
        .exec()
    );

    return {
      ...draft,
      itemCount: draft.items.length,
      expiresAt: expiresAtFrom(DRAFT_TTL_SECONDS * 1000),
    };
  }

  async replaceItems(
    scope: DraftScope,
    draftId: string,
    items: MenuDraftItem[]
  ): Promise<MenuDraftResponse | null> {
    const written = await this.writeIfAlive(scope, draftId, {
      [FIELDS.items]: JSON.stringify(items),
      [FIELDS.itemCount]: String(items.length),
      [FIELDS.updatedAt]: new Date().toISOString(),
    });
    if (!written) return null;

    return this.find(scope, draftId);
  }

  async saveFailure(
    scope: DraftScope,
    draftId: string,
    reason: string
  ): Promise<void> {
    await this.redis.set(
      failureKeyOf(scope, draftId),
      reason,
      "EX",
      FAILURE_TTL_SECONDS
    );
  }

  private async extendExpires(
    scope: DraftScope,
    draftId: string
  ): Promise<void> {
    await this.redis
      .multi()
      .expire(draftKeyOf(scope, draftId), DRAFT_TTL_SECONDS)
      .expire(indexKeyOf(scope), DRAFT_TTL_SECONDS)
      .exec();
  }

  async markCommitted(scope: DraftScope, draftId: string): Promise<void> {
    await this.writeIfAlive(scope, draftId, {
      [FIELDS.status]: "COMMITTED",
      [FIELDS.updatedAt]: new Date().toISOString(),
    });
  }

  /** 초안이 아직 살아 있을 때만 필드를 덮어쓴다. 실제로 썼는지를 돌려준다. */
  private async writeIfAlive(
    scope: DraftScope,
    draftId: string,
    fields: Record<string, string>
  ): Promise<boolean> {
    const written = await this.redis.eval(
      WRITE_IF_ALIVE,
      2,
      draftKeyOf(scope, draftId),
      indexKeyOf(scope),
      String(DRAFT_TTL_SECONDS),
      ...Object.entries(fields).flat()
    );

    return written === 1;
  }

  private toFields(draft: StoredMenuDraft): Record<string, string> {
    return {
      [FIELDS.status]: draft.status,
      [FIELDS.items]: JSON.stringify(draft.items),
      [FIELDS.itemCount]: String(draft.items.length),
      [FIELDS.unreadableCount]: String(draft.unreadableCount),
      [FIELDS.sourceImages]: JSON.stringify(draft.sourceImages),
      [FIELDS.createdAt]: draft.createdAt,
      [FIELDS.updatedAt]: draft.updatedAt,
    };
  }

  private toSummary(
    draftId: string,
    fields: Record<string, string | null | undefined>,
    pttl: number
  ): MenuDraftSummary | null {
    if (pttl <= 0) return null;

    const parsed = z
      .object({
        status: menuDraftStatusSchema,
        itemCount: countSchema,
        sourceImages: jsonArray(menuDraftSourceImageSchema),
        createdAt: isoSchema,
        updatedAt: isoSchema,
      })
      .safeParse(fields);

    if (!parsed.success) {
      this.logger.warn(`menu draft ${draftId} dropped: shape mismatch`);
      return null;
    }

    return { draftId, ...parsed.data, expiresAt: expiresAtFrom(pttl) };
  }

  private toDraft(
    draftId: string,
    fields: Record<string, string | null | undefined>,
    pttl: number
  ): MenuDraftResponse | null {
    const summary = this.toSummary(draftId, fields, pttl);
    if (!summary) return null;

    const parsed = z
      .object({
        items: jsonArray(menuDraftItemSchema),
        unreadableCount: countSchema,
      })
      .safeParse(fields);

    if (!parsed.success) {
      this.logger.warn(`menu draft ${draftId} dropped: item shape mismatch`);
      return null;
    }

    return { ...summary, ...parsed.data };
  }
}

/** Hash에는 문자열만 들어가므로 JSON 배열 필드는 파싱까지가 한 단위다. */
const jsonArray = <T>(item: z.ZodType<T>) =>
  z.string().transform((raw, ctx): T[] => {
    try {
      return z.array(item).parse(JSON.parse(raw));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid json" });
      return z.NEVER;
    }
  });

const expiresAtFrom = (pttlMs: number): string =>
  new Date(Date.now() + pttlMs).toISOString();

/**
 * MULTI가 실제로 다 쓰였는지 확인한다.
 * null은 트랜잭션이 통째로 버려졌다는 뜻이다(WATCH 충돌).
 */
const assertExecuted = (replies: [Error | null, unknown][] | null): void => {
  if (!replies) throw new Error("redis transaction aborted");

  for (const [error] of replies) {
    if (error) throw error;
  }
};

/** ioredis 파이프라인 응답은 `[error, value]`의 배열이다. */
const replyAt = <T>(
  replies: [Error | null, unknown][] | null,
  index: number
): T | null => {
  const reply = replies?.[index];
  if (!reply || reply[0]) return null;
  return (reply[1] as T) ?? null;
};

const zip = (
  keys: readonly string[],
  values: (string | null)[]
): Record<string, string | null> =>
  Object.fromEntries(keys.map((key, index) => [key, values[index] ?? null]));
