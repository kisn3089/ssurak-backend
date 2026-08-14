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

const DEFAULT_HOURLY_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60 * 60; // 1시간

const rateKeyOf = (ownerPublicId: string): string =>
  `menu-draft:rate:${ownerPublicId}`;

export interface DraftImageUpload {
  buffer: Buffer;
  fileName: string;
  byteSize: number;
}

@Injectable()
export class MenuDraftService {
  private readonly logger = new Logger(MenuDraftService.name);
  private readonly hourlyLimit: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly menuVisionClient: MenuVisionClient,
    private readonly menuDraftStore: MenuDraftStore,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService
  ) {
    this.hourlyLimit = this.configService.get<number>(
      "MENU_DRAFT_HOURLY_LIMIT",
      DEFAULT_HOURLY_LIMIT
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
    if (reusable?.kind === "draft") return reusable.draft;

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
    const drafts = await this.guarded(() =>
      this.menuDraftStore.list(buildScope(client, storeId))
    );

    return { drafts };
  }

  async getDraft(
    client: Owner,
    storeId: string,
    draftId: string
  ): Promise<MenuDraftResponse> {
    const draft = await this.guarded(() =>
      this.menuDraftStore.find(buildScope(client, storeId), draftId)
    );

    if (!draft) throw notFound();
    return draft;
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
        await this.menuDraftStore
          .saveFailure(scope, draftId, error.message)
          .catch((cause: unknown) => {
            this.logger.warn(
              `menu draft failure record write failed: ${String(cause)}`
            );
          });
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
        .expire(key, RATE_WINDOW_SECONDS, "NX")
        .exec();

      used = rateCountOf(replies);
    } catch (error: unknown) {
      this.logger.error(`menu draft rate limit unavailable: ${String(error)}`);
      throw new HttpException(
        "메뉴 인식을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (used > this.hourlyLimit) {
      throw new HttpException(
        `메뉴 인식은 1시간에 ${this.hourlyLimit}번까지 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
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
 * 10번을 쓴 뒤 영영 인식을 못 하게 된다. 조용히 새는 것보다 503으로 드러나는 편이 낫다.
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
