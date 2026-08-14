import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import { heicToJpeg, isHeic } from "./heic";
import { MAX_INPUT_PIXELS } from "./storage.constants";

/**
 * 비전 모델에 넣을 긴 변 상한.
 *
 * OpenAI는 detail:"high"에서 이미지를 512px 타일로 쪼개 읽으므로, 올린 픽셀이
 * 그대로 입력 토큰(=비용)이 된다. 1536은 3x3 타일에 맞아떨어지는 지점이고,
 * 그보다 키워도 메뉴판 글자 인식률은 거의 안 오르면서 비용만 붙는다.
 */
const OCR_MAX_EDGE = 1536;

/**
 * 이보다 작은 원본은 리사이즈해봐야 글자가 이미 뭉개져 있다.
 * 호출해서 빈 결과를 받느니(= 과금됨) 여기서 되돌린다.
 */
const OCR_MIN_EDGE = 600;

export interface OcrImage {
  dataUrl: string;
  bytes: number;
  optimized: Buffer;
}

export async function toOcrImage(buffer: Buffer): Promise<OcrImage> {
  const source = isHeic(buffer) ? await heicToJpeg(buffer) : buffer;

  await assertLegibleSource(source);

  const optimized = await decodeGuarded(() =>
    sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: OCR_MAX_EDGE,
        height: OCR_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
  );

  return {
    dataUrl: `data:image/jpeg;base64,${optimized.toString("base64")}`,
    bytes: optimized.byteLength,
    optimized,
  };
}

/**
 * 글자를 읽어낼 수 있는 해상도인지 본다.
 *
 * `.rotate()` 전이라 EXIF 방향이 반영되지 않았으므로 축을 구분하지 않고
 * 긴 변을 대조한다 — 가로로 눕힌 사진을 오탐하지 않기 위해서다.
 */
async function assertLegibleSource(buffer: Buffer): Promise<void> {
  const { width, height } = await decodeGuarded(() =>
    sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  );

  if (!width || !height) {
    throw new BadRequestException("이미지 정보를 읽을 수 없습니다.");
  }
  if (Math.max(width, height) < OCR_MIN_EDGE) {
    throw new BadRequestException(
      `메뉴판 사진은 긴 쪽이 최소 ${OCR_MIN_EDGE}px 이상이어야 글자를 읽을 수 있습니다.`
    );
  }
}

/**
 * sharp의 디코딩 실패를 400으로 갈아끼운다.
 *
 * multer의 fileFilter는 클라이언트가 붙인 MIME만 보므로, 내용이 깨졌거나
 * 이미지가 아닌 파일이 `image/png` 라벨을 달고 여기까지 온다. sharp는 그때
 * 평범한 Error를 던지고, 안 잡으면 전역 필터가 500으로 내보낸다 —
 * 사장님 입장에서는 서버 장애와 구분되지 않는 문제를 해결한다.
 */
async function decodeGuarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      "이미지를 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요."
    );
  }
}
