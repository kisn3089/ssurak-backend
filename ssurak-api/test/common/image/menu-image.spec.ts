import { describe, expect, it } from "vitest";
import { buildMenuImageUrls } from "src/common/image/menu-image";
import { MENU_VARIANT_NAMES } from "src/storage/image-variants";

const CDN = "https://cdn.example.com";

describe("buildMenuImageUrls", () => {
  it("imageKey가 없으면 null을 준다", () => {
    expect(buildMenuImageUrls(null, CDN)).toBeNull();
  });

  it("슬롯별 완성 URL을 만든다", () => {
    expect(buildMenuImageUrls("menu/abc123", CDN)).toEqual({
      hero: `${CDN}/menu/abc123/hero.webp`,
      thumbnail: `${CDN}/menu/abc123/thumbnail.webp`,
    });
  });

  it("CDN 베이스의 끝 슬래시 유무와 무관하게 같은 URL을 만든다", () => {
    expect(buildMenuImageUrls("menu/abc123", `${CDN}/`)).toEqual(
      buildMenuImageUrls("menu/abc123", CDN)
    );
  });

  it("정의된 모든 variant가 응답에 포함된다", () => {
    const urls = buildMenuImageUrls("menu/abc123", CDN);

    // variant를 추가하면 이 테스트가 자동으로 커버한다.
    expect(Object.keys(urls!).sort()).toEqual([...MENU_VARIANT_NAMES].sort());
  });
});
