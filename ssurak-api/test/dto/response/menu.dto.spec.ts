import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { PublicMenuDto } from "src/dto/response/menu.dto";
import { MenuImageService } from "src/common/image/menu-image.service";

const CDN = "https://cdn.example.com";

const menuImageService = new MenuImageService({
  getOrThrow: () => CDN,
} as unknown as ConfigService);

/** Prisma가 돌려주는 원본 row. imageKey를 그대로 들고 있다. */
const menuRowFixture = (imageKey: string | null = null) => ({
  id: 30n,
  categoryId: 40n,
  publicId: "menu-public-id",
  name: "아메리카노",
  price: 3000,
  description: null,
  imageKey,
  isAvailable: true,
  sortOrder: 0,
  requiredOptions: {
    사이즈: {
      options: [
        { key: "톨", price: 0 },
        { key: "라지", price: 500 },
      ],
      defaultKey: "톨",
    },
  },
  customOptions: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
});

/** 컨트롤러가 실제로 parse에 넘기는 형태(= row를 toView로 통과시킨 값). */
const menuViewFixture = (imageKey: string | null = null) =>
  menuImageService.toView(menuRowFixture(imageKey));

describe("PublicMenuDto.schema", () => {
  it("내부 식별자(id, categoryId)를 응답에서 제거한다", () => {
    const parsed = PublicMenuDto.schema.parse(menuViewFixture());

    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("categoryId");
    expect(parsed.publicId).toBe("menu-public-id");
  });

  it("S3 object key를 응답으로 흘리지 않는다", () => {
    const parsed = PublicMenuDto.schema.parse(menuViewFixture("menu/abc123"));

    // imageKey는 내부 값이다. 새어나가면 버킷 구조가 그대로 노출된다.
    expect(parsed).not.toHaveProperty("imageKey");
    expect(parsed.images).toEqual({
      hero: `${CDN}/menu/abc123/hero.webp`,
      thumbnail: `${CDN}/menu/abc123/thumbnail.webp`,
    });
  });

  it("이미지가 없는 메뉴는 images가 null이다", () => {
    const parsed = PublicMenuDto.schema.parse(menuViewFixture(null));

    expect(parsed.images).toBeNull();
  });

  it("옵션 JSON 구조를 그대로 통과시키고 잘못된 구조는 거부한다", () => {
    const parsed = PublicMenuDto.schema.parse(menuViewFixture());
    expect(parsed.requiredOptions?.사이즈.defaultKey).toBe("톨");

    expect(() =>
      PublicMenuDto.schema.parse({
        ...menuViewFixture(),
        requiredOptions: { 사이즈: { 잘못된: "구조" } },
      })
    ).toThrow();
  });
});
