import { describe, expect, it } from "vitest";
import { imageUploadOptions } from "src/storage/image-upload.options";

describe("imageUploadOptions", () => {
  /**
   * 빠지면 한글 파일명이 깨지는데, 그 증상은 실제로 업로드해 보기 전에는 드러나지 않는다.
   * busboy 기본값이 latin1이라 "지정 안 함"과 "잘못 지정"의 결과가 같다.
   */
  it("파일명을 UTF-8로 읽는다", () => {
    expect(imageUploadOptions(1024).defParamCharset).toBe("utf8");
  });

  it("상한은 라우트가 준 값을 그대로 쓴다", () => {
    expect(imageUploadOptions(5 * 1024 * 1024).limits?.fileSize).toBe(
      5 * 1024 * 1024
    );
  });
});
