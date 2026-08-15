import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CopyObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { createId } from "@paralleldrive/cuid2";
import { S3_CLIENT } from "./s3.provider";
import { heicToJpeg, isHeic } from "./heic";
import {
  MENU_VARIANTS,
  MENU_VARIANT_NAMES,
  MIN_SOURCE_HEIGHT,
  MIN_SOURCE_WIDTH,
  MenuVariant,
} from "./image-variants";
import {
  menuPrefixOf,
  objectKeyOf,
  parseOwnedTmpPrefix,
  tmpPrefixOf,
} from "./image-key";
import { MAX_INPUT_PIXELS } from "./storage.constants";

export interface VariantInfo {
  width: number;
  height: number;
  bytes: number;
}

export interface SavedImage {
  imageKey: string;
  variants: Record<MenuVariant, VariantInfo>;
}

/**
 * 이미지 최적화 + S3 저장 담당.
 *
 * 업로드는 `tmp/` 아래에 두고, 메뉴에 실제로 연결될 때 `menu/`로 복사해 확정한다.
 * 확정되지 않은 tmp 객체는 버킷 lifecycle 규칙(1일)이 정리한다.
 */
@Injectable()
export class StorageService {
  private readonly bucket: string;

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    private readonly configService: ConfigService
  ) {
    this.bucket = this.configService.getOrThrow<string>("S3_BUCKET");
  }

  async saveImage(buffer: Buffer, ownerPublicId: string): Promise<SavedImage> {
    // 아이폰 HEIC(HEVC)는 sharp가 못 읽으므로 JPEG로 옮긴 뒤 파이프라인에 태운다.
    const source = isHeic(buffer) ? await heicToJpeg(buffer) : buffer;

    await this.assertUsableSource(source);

    const prefix = tmpPrefixOf(ownerPublicId, createId());

    const uploadVariant = async (
      variant: MenuVariant
    ): Promise<VariantInfo> => {
      const spec = MENU_VARIANTS[variant];

      const optimized = await sharp(source, {
        limitInputPixels: MAX_INPUT_PIXELS,
      })
        .rotate()
        .resize({
          width: spec.width,
          height: spec.height,
          fit: "cover",
          withoutEnlargement: true,
        })
        .webp({ quality: spec.quality, effort: 5 })
        .toBuffer({ resolveWithObject: true });

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKeyOf(prefix, variant),
          Body: optimized.data,
          ContentType: "image/webp",
          // 키에 cuid2가 들어가 같은 키에 다른 내용이 절대 들어가지 않으므로
          // 영구 캐시가 안전하다. 이미지 교체는 항상 새 키를 만든다.
          CacheControl: "public, max-age=31536000, immutable",
        })
      );

      return {
        width: optimized.info.width,
        height: optimized.info.height,
        bytes: optimized.info.size,
      };
    };

    // variant를 병렬 업로드한 뒤 이름으로 record를 조립한다.
    // 명시적 리터럴이라 variant가 늘면 이 자리에서 컴파일이 깨진다(캐스팅 없이 완전성 보장).
    const [hero, thumbnail] = await Promise.all([
      uploadVariant("hero"),
      uploadVariant("thumbnail"),
    ]);
    const variants: Record<MenuVariant, VariantInfo> = { hero, thumbnail };

    return { imageKey: prefix, variants };
  }

  /**
   * 임시 이미지를 메뉴의 정식 경로로 확정한다.
   * 반환값을 DB의 `imageKey`에 저장한다.
   */
  async promoteMenuImage(
    tmpPrefix: string,
    ownerPublicId: string
  ): Promise<string> {
    const owned = parseOwnedTmpPrefix(tmpPrefix, ownerPublicId);
    if (!owned) {
      throw new BadRequestException("유효하지 않은 이미지 키입니다.");
    }

    const destPrefix = menuPrefixOf(owned.id);

    try {
      await Promise.all(
        MENU_VARIANT_NAMES.map((variant) =>
          this.s3.send(
            new CopyObjectCommand({
              Bucket: this.bucket,
              CopySource: `${this.bucket}/${objectKeyOf(tmpPrefix, variant)}`,
              Key: objectKeyOf(destPrefix, variant),
              MetadataDirective: "COPY",
            })
          )
        )
      );
    } catch (error) {
      if (this.isNoSuchKey(error)) {
        throw new NotFoundException(
          "업로드한 이미지를 찾을 수 없습니다. 이미지를 다시 업로드해주세요."
        );
      }
      throw error;
    }

    return destPrefix;
  }

  /**
   * 원본이 규격을 채울 수 있는 크기인지 확인한다.
   * withoutEnlargement 때문에 작은 원본은 확대되지 않아, URL은 정상인데
   * 실제 이미지만 규격 미달인 상태로 저장된다.
   */
  private async assertUsableSource(buffer: Buffer): Promise<void> {
    const { width, height } = await sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();

    if (!width || !height) {
      throw new BadRequestException("이미지 정보를 읽을 수 없습니다.");
    }
    if (width < MIN_SOURCE_WIDTH || height < MIN_SOURCE_HEIGHT) {
      throw new BadRequestException(
        `이미지는 최소 ${MIN_SOURCE_WIDTH}×${MIN_SOURCE_HEIGHT}px 이상이어야 합니다.`
      );
    }
  }

  private isNoSuchKey(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error.name === "NoSuchKey" || error.name === "NotFound")
    );
  }
}
