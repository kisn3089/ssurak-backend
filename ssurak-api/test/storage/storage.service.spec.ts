import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import sharp from "sharp";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { StorageService } from "src/storage/storage.service";
import { MENU_VARIANT_NAMES } from "src/storage/image-variants";
import { createId } from "@paralleldrive/cuid2";
import { BadRequestException } from "@nestjs/common";

const BUCKET = "ssurak-media-test";
const OWNER = "owner1publicid0000000000";

const s3 = mockDeep<S3Client>();
const configService = mockDeep<ConfigService>();
configService.getOrThrow.mockReturnValue(BUCKET);

const service = new StorageService(s3, configService);

/** 위쪽 절반 빨강, 아래쪽 절반 파랑인 정사각 원본. */
async function halfRedHalfBlue(
  size = 800,
  orientation?: number
): Promise<Buffer> {
  const pixels = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const isTop = y < size / 2;
      pixels[i] = isTop ? 255 : 0;
      pixels[i + 2] = isTop ? 0 : 255;
    }
  }

  const image = sharp(pixels, {
    raw: { width: size, height: size, channels: 3 },
  });
  return await (orientation ? image.withMetadata({ orientation }) : image)
    .jpeg()
    .toBuffer();
}

/**
 * 아이폰이 쓰는 실제 HEIC(HEVC) 원본 900×700. sharp는 heif 출력(HEVC 인코더)을
 * 못 하므로 런타임 생성이 불가 — 커밋된 픽스처를 읽는다.
 */
const heicSample = (): Buffer =>
  readFileSync(resolve("test/storage/fixtures/iphone-sample.heic"));

/** 폭·높이를 따로 지정하는 단색 원본. 축별 최소 크기 검증을 확인한다. */
async function solidRect(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  })
    .jpeg()
    .toBuffer();
}

type PutInput = {
  Bucket?: string;
  Key?: string;
  ContentType?: string;
  CacheControl?: string;
  Body?: unknown;
};

/**
 * send()에 실려간 PutObject 입력만 골라낸다.
 * SDK의 Command 제네릭은 좁혀지지 않으므로 인스턴스로 거른 뒤 input만 본다.
 */
function putInputs(): PutInput[] {
  return s3.send.mock.calls
    .map(([command]): unknown => command)
    .filter(
      (command): command is PutObjectCommand =>
        command instanceof PutObjectCommand
    )
    .map((command) => command.input);
}

/** 특정 좌표의 RGB를 읽는다. */
async function pixelAt(
  buffer: Buffer,
  x: number,
  y: number
): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

beforeEach(() => {
  s3.send.mockClear();
});

describe("StorageService.saveImage", () => {
  it("한 번의 업로드로 정의된 모든 변형을 올린다", async () => {
    await service.saveImage(await halfRedHalfBlue(), OWNER);

    expect(putInputs()).toHaveLength(MENU_VARIANT_NAMES.length);
  });

  it("모든 객체를 요청자의 임시 경로 아래 webp로 올린다", async () => {
    const saved = await service.saveImage(await halfRedHalfBlue(), OWNER);

    for (const input of putInputs()) {
      expect(input.Bucket).toBe(BUCKET);
      expect(input.Key).toMatch(
        new RegExp(`^tmp/${OWNER}/[a-z0-9]+/[a-z]+\\.webp$`)
      );
      expect(input.ContentType).toBe("image/webp");
    }
    // 반환 키는 variant와 확장자를 뺀 prefix여야 그대로 확정에 쓸 수 있다.
    expect(saved.imageKey).toMatch(new RegExp(`^tmp/${OWNER}/[a-z0-9]+$`));
    expect(saved.imageKey).not.toContain(".webp");
  });

  it("EXIF를 제거해 원본의 GPS 좌표가 새어나가지 않는다", async () => {
    await service.saveImage(await halfRedHalfBlue(800, 6), OWNER);

    for (const input of putInputs()) {
      const metadata = await sharp(input.Body as Buffer).metadata();
      expect(metadata.exif).toBeUndefined();
    }
  });

  it("EXIF 방향을 픽셀에 굽는다 (세로 사진이 눕지 않는다)", async () => {
    // orientation 6 = 표시할 때 시계방향 90도 회전.
    // 원본의 위쪽(빨강)이 회전 후 오른쪽으로 간다.
    await service.saveImage(await halfRedHalfBlue(800, 6), OWNER);

    const thumbnail = putInputs().find((input) =>
      input.Key?.endsWith("thumbnail.webp")
    );
    const body = thumbnail!.Body as Buffer;

    const left = await pixelAt(body, 60, 120);
    const right = await pixelAt(body, 180, 120);

    expect(right.r).toBeGreaterThan(200);
    expect(left.b).toBeGreaterThan(200);
  });

  it("규격을 채울 수 없을 만큼 작은 원본은 거절한다", async () => {
    const tooSmall = await halfRedHalfBlue(100);

    await expect(service.saveImage(tooSmall, OWNER)).rejects.toThrowError(
      BadRequestException
    );

    expect(s3.send).not.toHaveBeenCalled();
  });

  it("폭·높이가 모두 규격을 채우면 가로로 긴 원본도 통과한다", async () => {
    // min(w,h) 같은 단일 스칼라 검증이면 min(800,600)=600이 hero 폭(780) 미만이라
    // 오탐하던 정상 원본. 축마다 따로 봐야 통과한다.
    await expect(
      service.saveImage(await solidRect(800, 600), OWNER)
    ).resolves.toBeDefined();
  });

  it("한 축이라도 규격 미달이면 거절한다", async () => {
    // 폭(800)은 충분하지만 높이(500)가 hero(585) 미만 — 그대로 두면 hero가 규격 미달로 저장된다.
    await expect(
      service.saveImage(await solidRect(800, 500), OWNER)
    ).rejects.toThrowError(BadRequestException);

    expect(s3.send).not.toHaveBeenCalled();
  });

  it("아이폰 HEIC 원본은 JPEG로 변환해 webp variant로 저장한다", async () => {
    // sharp는 HEIC를 직접 못 읽으므로 heic-convert가 먼저 돌아야 파이프라인이 성공한다.
    const saved = await service.saveImage(heicSample(), OWNER);

    expect(putInputs()).toHaveLength(MENU_VARIANT_NAMES.length);
    for (const input of putInputs()) {
      expect(input.ContentType).toBe("image/webp");
    }
    expect(saved.imageKey).toMatch(new RegExp(`^tmp/${OWNER}/[a-z0-9]+$`));
  });

  it("HEIC로 보였지만 변환할 수 없는 파일은 400으로 거절한다", async () => {
    // 유효한 ftyp/heic 헤더만 있고 실데이터가 없어 heic-convert가 실패하는 케이스.
    // 안 잡으면 평범한 Error → 500이 되므로 400으로 나가야 한다.
    const fakeHeic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypheic", "ascii"),
      Buffer.alloc(16),
    ]);

    await expect(service.saveImage(fakeHeic, OWNER)).rejects.toThrowError(
      BadRequestException
    );

    expect(s3.send).not.toHaveBeenCalled();
  });
});

describe("StorageService.promoteMenuImage", () => {
  it("남의 임시 키는 S3를 건드리기 전에 거절한다", async () => {
    const foreign = `tmp/someone-else/${createId()}`;

    await expect(service.promoteMenuImage(foreign, OWNER)).rejects.toThrowError(
      BadRequestException
    );

    expect(s3.send).not.toHaveBeenCalled();
  });

  it("확정하면 variant마다 정식 경로로 복사하고 prefix를 돌려준다", async () => {
    const id = createId();

    const promoted = await service.promoteMenuImage(
      `tmp/${OWNER}/${id}`,
      OWNER
    );

    expect(promoted).toBe(`menu/${id}`);
    expect(s3.send).toHaveBeenCalledTimes(MENU_VARIANT_NAMES.length);
  });

  it("원본 tmp 객체를 지우지 않는다 (lifecycle에 맡긴다)", async () => {
    await service.promoteMenuImage(`tmp/${OWNER}/${createId()}`, OWNER);

    const deletes = s3.send.mock.calls.filter(([command]) =>
      command?.constructor?.name?.includes("Delete")
    );
    expect(deletes).toHaveLength(0);
  });
});
