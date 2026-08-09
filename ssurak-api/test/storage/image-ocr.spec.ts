import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";
import { toOcrImage } from "src/storage/image-ocr";

// vitest는 패키지 루트(ssurak-api)를 cwd로 실행한다.
const heicSample = (): Buffer =>
  readFileSync(resolve("test/storage/fixtures/iphone-sample.heic"));

const canvas = (width: number, height: number): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .jpeg()
    .toBuffer();

/** dataUrl을 다시 디코딩해 실제로 나간 픽셀을 확인한다. */
const decode = async (dataUrl: string) => {
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  return await sharp(Buffer.from(base64, "base64")).metadata();
};

describe("toOcrImage", () => {
  it("긴 변을 1536으로 줄이되 가로세로 비율을 유지한다 (크롭 없음)", async () => {
    // 메뉴 이미지 파이프라인(fit:"cover")을 재사용하면 여기서 가장자리가 잘려나가고,
    // 메뉴판에서는 그 가장자리가 곧 메뉴 항목이다.
    const image = await toOcrImage(await canvas(3000, 1000));
    const { width, height } = await decode(image.dataUrl);

    expect(width).toBe(1536);
    expect(height).toBe(512);
  });

  it("세로로 긴 메뉴판도 짧은 변 기준으로 잘리지 않는다", async () => {
    const image = await toOcrImage(await canvas(1000, 3000));
    const { width, height } = await decode(image.dataUrl);

    expect(width).toBe(512);
    expect(height).toBe(1536);
  });

  it("1536보다 작은 원본은 확대하지 않는다", async () => {
    const image = await toOcrImage(await canvas(1200, 900));
    const { width, height } = await decode(image.dataUrl);

    expect(width).toBe(1200);
    expect(height).toBe(900);
  });

  it("긴 변이 600px 미만이면 거절한다", async () => {
    // 리사이즈해봐야 글자가 이미 뭉개져 있다. 호출하면 그대로 과금되므로 그 전에 막는다.
    await expect(toOcrImage(await canvas(400, 300))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("아이폰 HEIC도 JPEG data URL로 나간다", async () => {
    const image = await toOcrImage(heicSample());

    expect(image.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(image.bytes).toBeGreaterThan(0);
  });

  it("이미지가 아닌 버퍼는 400으로 돌려준다", async () => {
    await expect(
      toOcrImage(Buffer.from("not an image at all"))
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
