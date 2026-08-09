import { createHash } from "node:crypto";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { Owner } from "@ssurak/db";
import {
  menuExtractionSchema,
  type MenuDraftResponse,
  type MenuExtraction,
} from "@ssurak/schema";
import { PrismaService } from "src/prisma/prisma.service";
import { REDIS_CLIENT } from "src/redis/redis.provider";
import { toOcrImage, type OcrImage } from "src/storage/image-ocr";
import { MenuVisionClient } from "./menu-vision.client";
import { toMenuDraft, type MenuDraftContext } from "./menu-draft.mapper";

/** 점주 1인당 시간당 인식 횟수. 인증된 요청이 그대로 토큰 비용이라 상한이 필요하다. */
const DEFAULT_HOURLY_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60 * 60;

/**
 * 같은 사진 재요청에 대한 캐시 수명.
 *
 * 네트워크가 끊겨 다시 누르거나 뒤로 갔다 돌아오는 흐름에서 같은 사진이 반복해서
 * 들어온다. 이 캐시가 없으면 그때마다 그대로 과금된다.
 */
const CACHE_TTL_SECONDS = 10 * 60;

const rateKeyOf = (ownerPublicId: string): string =>
  `menu-draft:rate:${ownerPublicId}`;
const cacheKeyOf = (digest: string): string => `menu-draft:cache:${digest}`;

/**
 * 메뉴판 사진에서 메뉴 초안을 뽑는 흐름의 오케스트레이션.
 *
 * 전처리 → 비전 호출 → 정규화 순서로만 엮고, 각 단계의 판단은 해당 모듈이 갖는다.
 * DB에는 아무것도 쓰지 않는다 — 확정은 사장님이 검토한 뒤 일괄 등록으로 한다.
 */
@Injectable()
export class MenuDraftService {
  private readonly logger = new Logger(MenuDraftService.name);
  private readonly hourlyLimit: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly menuVisionClient: MenuVisionClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService
  ) {
    this.hourlyLimit = this.configService.get<number>(
      "MENU_DRAFT_HOURLY_LIMIT",
      DEFAULT_HOURLY_LIMIT
    );
  }

  async draftFromImages(
    client: Owner,
    storeId: string,
    buffers: Buffer[]
  ): Promise<MenuDraftResponse> {
    await this.assertWithinRateLimit(client.publicId);

    // 카테고리는 프롬프트(분류명 맞춰 쓰기)와 매핑(기존 카테고리 매칭) 양쪽에 쓰인다.
    const context = await this.loadContext(client, storeId);
    const categoryNames = context.categories.map((category) => category.name);

    const images = await Promise.all(
      buffers.map((buffer) => toOcrImage(buffer))
    );

    const extraction = await this.extractCached(images, categoryNames);

    // 매핑은 캐시하지 않는다. 캐시된 인식 결과라도 카테고리·기존 메뉴는
    // 매번 새로 읽은 값과 대조해야 중복·매칭 표시가 지금 상태를 반영한다.
    return toMenuDraft(extraction, context);
  }

  /**
   * 같은 사진 + 같은 카테고리 힌트면 모델을 다시 부르지 않는다.
   *
   * 카테고리 이름이 키에 들어가는 이유: 프롬프트에 실려 나가는 값이라
   * 카테고리가 바뀌면 같은 사진이라도 인식 결과가 달라질 수 있다.
   */
  private async extractCached(
    images: OcrImage[],
    categoryNames: string[]
  ): Promise<MenuExtraction> {
    const key = cacheKeyOf(this.digestOf(images, categoryNames));

    const cached = await this.readCache(key);
    if (cached) return cached;

    const extraction = await this.menuVisionClient.extract(
      images,
      categoryNames
    );

    // 캐시 쓰기 실패로 요청을 깨뜨리지 않는다 — 비용 최적화지 정합성 요건이 아니다.
    await this.redis
      .set(key, JSON.stringify(extraction), "EX", CACHE_TTL_SECONDS)
      .catch((error: unknown) => {
        this.logger.warn(`menu draft cache write failed: ${String(error)}`);
      });

    return extraction;
  }

  /**
   * 캐시된 값도 스키마로 다시 통과시킨다.
   * 배포 사이에 계약이 바뀌면 예전 모양이 남아 있는데, 그대로 믿으면
   * 매핑 단계가 없는 필드를 읽는다.
   */
  private async readCache(key: string): Promise<MenuExtraction | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;

      const parsed = menuExtractionSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch (error: unknown) {
      this.logger.warn(`menu draft cache read failed: ${String(error)}`);
      return null;
    }
  }

  private digestOf(images: OcrImage[], categoryNames: string[]): string {
    const hash = createHash("sha256");
    for (const image of images) hash.update(image.dataUrl);
    // 카테고리 순서가 바뀌었을 뿐인데 캐시가 빗나가지 않도록 정렬해 넣는다.
    hash.update(`\n${[...categoryNames].sort().join("\n")}`);
    return hash.digest("hex");
  }

  /**
   * 고정 윈도우 카운터. 경계에서 최대 2배까지 통과할 수 있지만, 여기서 막으려는 건
   * 정밀한 쿼터가 아니라 폭주다 — 그 정도 오차는 슬라이딩 윈도우의 복잡도만큼 값어치가 없다.
   *
   * 캐시 적중도 1회로 센다. 인식 이전 단계(HEIC 디코딩·리사이즈)도 CPU를 쓰므로
   * 모델 호출 여부와 무관하게 요청 자체를 제한해야 방어선이 된다.
   */
  private async assertWithinRateLimit(ownerPublicId: string): Promise<void> {
    const key = rateKeyOf(ownerPublicId);

    let used: number;
    try {
      used = await this.redis.incr(key);
      if (used === 1) await this.redis.expire(key, RATE_WINDOW_SECONDS);
    } catch (error: unknown) {
      // Redis가 죽었다고 유료 API를 무제한 열어두지 않는다.
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

  /** 매핑에 필요한 매장 현재 상태. 삭제된 메뉴는 중복 판정 대상이 아니다. */
  private async loadContext(
    client: Owner,
    storeId: string
  ): Promise<MenuDraftContext> {
    const whereStore = { publicId: storeId, owner: { id: client.id } };

    const [categories, menus] = await Promise.all([
      this.prismaService.category.findMany({
        where: { store: whereStore },
        select: { publicId: true, name: true },
        orderBy: { sortOrder: "asc" },
      }),
      this.prismaService.menu.findMany({
        where: { deletedAt: null, category: { store: whereStore } },
        select: { name: true },
      }),
    ]);

    return {
      categories,
      existingMenuNames: menus.map((menu) => menu.name),
    };
  }
}
