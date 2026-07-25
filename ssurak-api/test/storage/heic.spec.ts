import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isHeic } from "src/storage/heic";

// vitest는 패키지 루트(ssurak-api)를 cwd로 실행한다.
const heicSample = (): Buffer =>
  readFileSync(resolve("test/storage/fixtures/iphone-sample.heic"));

const solid = (encode: (s: sharp.Sharp) => sharp.Sharp): Promise<Buffer> =>
  encode(
    sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
  ).toBuffer();

describe("isHeic", () => {
  it("실제 아이폰 HEIC(HEVC)는 true", () => {
    expect(isHeic(heicSample())).toBe(true);
  });

  it("JPEG은 false", async () => {
    expect(isHeic(await solid((s) => s.jpeg()))).toBe(false);
  });

  it("AVIF는 false — sharp가 직접 디코드하므로 변환 대상이 아니다", async () => {
    // AVIF도 같은 ISO BMFF ftyp 컨테이너라 HEVC 브랜드로만 구분해야 오분류가 없다.
    expect(isHeic(await solid((s) => s.avif()))).toBe(false);
  });

  it("ftyp 박스를 이룰 수 없는 짧은 버퍼는 false", () => {
    expect(isHeic(Buffer.from([0, 0, 0, 1]))).toBe(false);
  });
});
