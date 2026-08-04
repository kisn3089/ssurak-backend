import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { PublicMenuDto } from "src/dto/response/menu.dto";
import { MenuImageService } from "src/common/image/menu-image.service";
import { OptionChoiceState, OptionSelectionType } from "@ssurak/db";

const CDN = "https://cdn.example.com";

const menuImageService = new MenuImageService(
  new ConfigService({ CDN_BASE_URL: CDN })
);

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
  options: [
    {
      publicId: "optsize",
      name: "사이즈",
      selectionType: OptionSelectionType.SINGLE,
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 10,
      enabled: true,
      trigger: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      choices: [
        {
          publicId: "chotall",
          name: "톨",
          priceDelta: 0,
          quantityEnabled: false,
          maxQuantity: 1,
          isDefault: true,
          sortOrder: 10,
          state: OptionChoiceState.AVAILABLE,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    },
  ],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
});

/** 컨트롤러가 실제로 parse에 넘기는 형태(= row를 toView로 통과시킨 값). */
const menuViewFixture = (imageKey: string | null = null) =>
  menuImageService.toView(menuRowFixture(imageKey));

describe("PublicMenuDto.schema", () => {
  it("내부 id는 제거하되 categoryId는 노출한다 (프론트 메뉴 수정용)", () => {
    const parsed = PublicMenuDto.schema.parse(menuViewFixture());

    expect(parsed).not.toHaveProperty("id");
    // categoryId는 프론트가 수정 폼에서 카테고리를 매칭하는 데 필요해 노출한다.
    expect(parsed.categoryId).toBe(40n);
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

  it("옵션은 메뉴 응답에서 제거된다 (옵션 API로 따로 내려간다)", () => {
    // row에 options가 실려 있어도 응답으로는 나가지 않아야 한다.
    // 나가면 프론트가 메뉴 캐시로 옵션을 렌더하게 되고, 옵션만 수정했을 때 화면이 어긋난다.
    const parsed = PublicMenuDto.schema.parse(menuViewFixture());

    expect(parsed).not.toHaveProperty("options");
  });
});
