import { createHash } from "node:crypto";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { Owner } from "@ssurak/db";
import {
  DRAFT_ID_LENGTH,
  type MenuDraftListResponse,
  type MenuDraftResponse,
  type MenuDraftSourceImage,
  type MenuExtraction,
  type UpdateMenuDraftPayload,
} from "@ssurak/schema";
import { PrismaService } from "src/prisma/prisma.service";
import { REDIS_CLIENT } from "src/redis/redis.provider";
import { toOcrImage, type OcrImage } from "src/storage/image-ocr";
import { toThumbnailDataUrl } from "src/storage/image-thumbnail";
import { MenuVisionClient } from "./menu-vision.client";
import {
  recomputeMenuDraftIssues,
  reviseMenuDraftItems,
  toMenuDraft,
  type DraftCategoryRef,
  type MenuDraftContext,
} from "./menu-draft.mapper";
import {
  DRAFT_TTL_SECONDS,
  MenuDraftStore,
  type DraftScope,
} from "./menu-draft.store";

/** 상한은 점주 단위다. 매장을 여럿 가진 점주도 총량은 하나로 묶인다. */
const rateKeyOf = (ownerPublicId: string): string =>
  `menu-draft:rate:${ownerPublicId}`;

/** TTL이 돌려주는 특수값. -2는 키 없음, -1은 만료 없음. */
const TTL_NO_EXPIRY = -1;

type MenuDraftRateState = Pick<
  MenuDraftListResponse,
  "remaining" | "resetAt" | "rateLimit" | "rateWindowHours"
>;

export interface DraftImageUpload {
  buffer: Buffer;
  fileName: string;
  byteSize: number;
}

@Injectable()
export class MenuDraftService {
  private readonly logger = new Logger(MenuDraftService.name);
  private readonly rateLimit: number;
  private readonly rateWindowHours: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly menuVisionClient: MenuVisionClient,
    private readonly menuDraftStore: MenuDraftStore,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService
  ) {
    this.rateLimit = this.configService.getOrThrow<number>(
      "MENU_DRAFT_RATE_LIMIT"
    );
    this.rateWindowHours = this.configService.getOrThrow<number>(
      "MENU_DRAFT_RATE_WINDOW_HOURS"
    );
  }

  async createDraft(
    client: Owner,
    storeId: string,
    uploads: DraftImageUpload[]
  ): Promise<MenuDraftResponse> {
    const scope = buildScope(client, storeId);

    const categories = await this.getCategories(client, storeId);
    const categoryNames = categories.map((category) => category.name);

    const optimizedImages = await Promise.all(
      uploads.map((upload) => toOcrImage(upload.buffer))
    );

    const createdDraftId = this.createDraftId(optimizedImages, categoryNames);

    const reusable = await this.assertReusable(scope, createdDraftId);
    if (reusable?.kind === "failure") {
      throw new UnprocessableEntityException(reusable.reason);
    }
    if (reusable?.kind === "draft") {
      return await this.refreshReused(
        client,
        storeId,
        categories,
        reusable.draft
      );
    }

    await this.assertWithinRateLimit(client.publicId);

    const extraction = await this.extract(
      scope,
      createdDraftId,
      optimizedImages,
      categoryNames
    );

    const existingMenuNames = await this.getExistingMenuNames(client, storeId);
    const draftContent = toMenuDraft(extraction, {
      categories,
      existingMenuNames,
    });

    const createdAt = new Date();
    const draft = {
      draftId: createdDraftId,
      status: "READY" as const,
      ...draftContent,
      sourceImages: await this.toSourceImages(uploads, optimizedImages),
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    };

    try {
      return await this.menuDraftStore.save(scope, draft, createdAt);
    } catch (error: unknown) {
      // 모델 비용은 이미 나갔다. 저장에 실패했다고 결과까지 버리지는 않는다 —
      // 이번 응답은 정상이고, 다음 GET에서 없는 초안이 될 뿐이다.
      this.logger.error(`menu draft save failed: ${String(error)}`);
      return {
        ...draft,
        itemCount: draft.items.length,
        expiresAt: new Date(
          createdAt.getTime() + DRAFT_TTL_SECONDS * 1000
        ).toISOString(),
      };
    }
  }

  async listDrafts(
    client: Owner,
    storeId: string
  ): Promise<MenuDraftListResponse> {
    const scope = buildScope(client, storeId);

    const [drafts, rate] = await Promise.all([
      this.guarded(() => this.menuDraftStore.list(scope)),
      this.readRateState(client.publicId),
    ]);

    return { drafts, ...rate };
  }

  async getDraft(
    client: Owner,
    storeId: string,
    draftId: string
  ): Promise<MenuDraftResponse> {
    const [draft, context] = await Promise.all([
      this.guarded(() =>
        this.menuDraftStore.find(buildScope(client, storeId), draftId)
      ),
      this.loadContext(client, storeId),
    ]);

    if (!draft) throw notFound();
    return { ...draft, items: recomputeMenuDraftIssues(draft.items, context) };
  }

  async updateDraftItems(
    client: Owner,
    storeId: string,
    draftId: string,
    payload: UpdateMenuDraftPayload
  ): Promise<MenuDraftResponse> {
    const context = await this.loadContext(client, storeId);
    const items = reviseMenuDraftItems(payload.items, context);

    const updated = await this.guarded(() =>
      this.menuDraftStore.replaceItems(
        buildScope(client, storeId),
        draftId,
        items
      )
    );

    if (!updated) throw notFound();
    return updated;
  }

  async markCommitted(
    client: Owner,
    storeId: string,
    draftId: string
  ): Promise<void> {
    try {
      await this.menuDraftStore.markCommitted(
        buildScope(client, storeId),
        draftId
      );
    } catch (error: unknown) {
      this.logger.error(`menu draft mark committed failed: ${String(error)}`);
    }
  }

  private async refreshReused(
    client: Owner,
    storeId: string,
    categories: DraftCategoryRef[],
    draft: MenuDraftResponse
  ): Promise<MenuDraftResponse> {
    const existingMenuNames = await this.getExistingMenuNames(client, storeId);

    return {
      ...draft,
      items: recomputeMenuDraftIssues(draft.items, {
        categories,
        existingMenuNames,
      }),
    };
  }

  private async readRateState(
    ownerPublicId: string
  ): Promise<MenuDraftRateState> {
    const key = rateKeyOf(ownerPublicId);

    try {
      const replies = await this.redis.multi().get(key).ttl(key).exec();
      const { used, ttlSeconds } = rateStateOf(replies);

      if (ttlSeconds === TTL_NO_EXPIRY) {
        this.logger.warn(`menu draft rate counter has no ttl: ${key}`);
      }

      return {
        rateLimit: this.rateLimit,
        remaining: Math.max(this.rateLimit - used, 0),
        resetAt:
          ttlSeconds > 0
            ? new Date(Date.now() + ttlSeconds * 1000).toISOString()
            : null,
        rateWindowHours: this.rateWindowHours,
      };
    } catch (error: unknown) {
      this.logger.warn(`menu draft rate state unavailable: ${String(error)}`);
      return {
        remaining: null,
        resetAt: null,
        rateLimit: this.rateLimit,
        rateWindowHours: this.rateWindowHours,
      };
    }
  }

  private async assertReusable(scope: DraftScope, draftId: string) {
    try {
      return await this.menuDraftStore.findOrFailure(scope, draftId);
    } catch (error: unknown) {
      /** Redis가 죽어 있으면 "없음"으로 취급하고 진행한다 */
      this.logger.warn(`menu draft lookup failed: ${String(error)}`);
      return null;
    }
  }

  private async extract(
    scope: DraftScope,
    draftId: string,
    images: OcrImage[],
    categoryNames: string[]
  ): Promise<MenuExtraction> {
    try {
      return await this.menuVisionClient.extract(images, categoryNames);
    } catch (error: unknown) {
      if (error instanceof UnprocessableEntityException) {
        // 모델이 "메뉴판이 아니다"라고 답한 것도 호출이다 — 토큰 비용은 이미 나갔으므로
        // 횟수는 그대로 먹는다. 대신 실패를 기록해 같은 사진으로 다시 태우지 못하게 막는다.
        await this.menuDraftStore
          .saveFailure(scope, draftId, error.message)
          .catch((cause: unknown) => {
            this.logger.warn(
              `menu draft failure record write failed: ${String(cause)}`
            );
          });
      } else {
        await this.refundRateLimit(scope.ownerPublicId);
      }
      throw error;
    }
  }

  private toSourceImages(
    uploads: DraftImageUpload[],
    optimizedImages: OcrImage[]
  ): Promise<MenuDraftSourceImage[]> {
    return Promise.all(
      optimizedImages.map(async (image, order) => ({
        fileName: uploads[order].fileName,
        byteSize: uploads[order].byteSize,
        thumbnail: await toThumbnailDataUrl(image.optimized),
      }))
    );
  }

  private createDraftId(images: OcrImage[], categoryNames: string[]): string {
    const createdHash = createHash("sha256");
    for (const image of images) createdHash.update(image.dataUrl);
    createdHash.update(`\n${[...categoryNames].sort().join("\n")}`);

    return createdHash.digest("base64url").slice(0, DRAFT_ID_LENGTH);
  }

  private async assertWithinRateLimit(ownerPublicId: string): Promise<void> {
    const key = rateKeyOf(ownerPublicId);

    let used: number;
    try {
      const replies = await this.redis
        .multi()
        .incr(key)
        .expire(key, this.rateWindowHours * 60 * 60, "NX")
        .exec();

      used = rateCountOf(replies);
    } catch (error: unknown) {
      this.logger.error(`menu draft rate limit unavailable: ${String(error)}`);
      throw new HttpException(
        "메뉴 인식을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (used > this.rateLimit) {
      await this.refundRateLimit(ownerPublicId);
      throw new HttpException(
        `메뉴 인식은 ${this.rateWindowHours}시간에 ${this.rateLimit}번까지 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * 잡아둔 자리를 돌려준다. 실패해도 삼킨다 — 되돌리기가 원래 실패 이유를 덮으면 안 된다.
   * 평범한 DECR을 쓰지 않는 이유는 스크립트 주석 참고.
   */
  private async refundRateLimit(ownerPublicId: string): Promise<void> {
    try {
      await this.redis.eval(RATE_REFUND_SCRIPT, 1, rateKeyOf(ownerPublicId));
    } catch (error: unknown) {
      this.logger.warn(`menu draft rate refund failed: ${String(error)}`);
    }
  }

  /** 초안이 없는 것과 저장소가 죽은 것을 섞지 않는다. 사장님이 취할 행동이 다르다. */
  private async guarded<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      this.logger.error(`menu draft store unavailable: ${String(error)}`);
      throw new ServiceUnavailableException(
        "메뉴 초안을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  }

  private async loadContext(
    client: Owner,
    storeId: string
  ): Promise<MenuDraftContext> {
    const [categories, existingMenuNames] = await Promise.all([
      this.getCategories(client, storeId),
      this.getExistingMenuNames(client, storeId),
    ]);

    return { categories, existingMenuNames };
  }

  private getCategories(
    client: Owner,
    storeId: string
  ): Promise<DraftCategoryRef[]> {
    return this.prismaService.category.findMany({
      where: { store: whereStoreOf(client, storeId) },
      select: { publicId: true, name: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  private async getExistingMenuNames(
    client: Owner,
    storeId: string
  ): Promise<string[]> {
    const menus = await this.prismaService.menu.findMany({
      where: {
        deletedAt: null,
        category: { store: whereStoreOf(client, storeId) },
      },
      select: { name: true },
    });

    return menus.map((menu) => menu.name);
  }
}

const buildScope = (client: Owner, storeId: string): DraftScope => ({
  ownerPublicId: client.publicId,
  storeId,
});

const whereStoreOf = (client: Owner, storeId: string) => ({
  publicId: storeId,
  owner: { id: client.id },
});

const notFound = (): NotFoundException =>
  new NotFoundException(
    "메뉴 초안을 찾을 수 없습니다. 12시간이 지나 만료되었을 수 있습니다."
  );

/**
 * MULTI의 응답은 명령마다 `[error, value]`다.
 *
 * EXPIRE 쪽 실패까지 들여다보는 이유: 그냥 넘기면 TTL 없는 카운터가 남아 그 점주는
 * 상한을 채운 뒤 영영 인식을 못 하게 된다. 조용히 새는 것보다 503으로 드러나는 편이 낫다.
 */
const rateCountOf = (replies: [Error | null, unknown][] | null): number => {
  if (!replies || replies.length !== 2) {
    throw new TypeError(
      `unexpected rate limit reply: ${JSON.stringify(replies)}`
    );
  }

  for (const [error] of replies) {
    if (error) throw error;
  }

  const used = replies[0][1];
  if (typeof used !== "number") {
    throw new TypeError(`unexpected rate limit counter: ${typeof used}`);
  }

  return used;
};

/**
 * 예약분 되돌리기.
 *
 * 맨 DECR을 쓰면 이미 만료된 키를 -1로 되살려 TTL 없는 카운터가 남는다. 그러면 그
 * 점주는 다음 창에서 6번을 쓰게 되고, 그 키는 영영 초기화되지 않는다.
 * 0 이하로 내려가면 지워서 "창이 없는 상태"로 되돌린다 — 빈 창과 같은 뜻이다.
 * DECR은 TTL을 건드리지 않으므로 남은 창 길이는 그대로 유지된다.
 */
const RATE_REFUND_SCRIPT = `
local used = redis.call('DECR', KEYS[1])
if used <= 0 then redis.call('DEL', KEYS[1]) end
return used
`;

const rateStateOf = (
  replies: [Error | null, unknown][] | null
): { used: number; ttlSeconds: number } => {
  if (!replies || replies.length !== 2) {
    throw new TypeError(
      `unexpected rate state reply: ${JSON.stringify(replies)}`
    );
  }

  for (const [error] of replies) {
    if (error) throw error;
  }

  const counter = replies[0][1];
  const used = counter === null ? 0 : Number(counter);
  if (!Number.isInteger(used) || used < 0) {
    throw new TypeError(`unexpected rate state counter: ${String(counter)}`);
  }

  const ttlSeconds = replies[1][1];
  if (typeof ttlSeconds !== "number") {
    throw new TypeError(`unexpected rate state ttl: ${typeof ttlSeconds}`);
  }

  return { used, ttlSeconds };
};
