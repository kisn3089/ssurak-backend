import { describe, expect, it } from "vitest";
import { PublicMenuDto } from "src/dto/response/menu.dto";

const menuRowFixture = () => ({
  id: 30n,
  categoryId: 40n,
  publicId: "menu-public-id",
  name: "아메리카노",
  price: 3000,
  description: null,
  imageUrl: null,
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

describe("PublicMenuDto.schema", () => {
  it("내부 식별자(id, categoryId)를 응답에서 제거한다", () => {
    const parsed = PublicMenuDto.schema.parse(menuRowFixture());

    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("categoryId");
    expect(parsed.publicId).toBe("menu-public-id");
  });

  it("옵션 JSON 구조를 그대로 통과시키고 잘못된 구조는 거부한다", () => {
    const parsed = PublicMenuDto.schema.parse(menuRowFixture());
    expect(parsed.requiredOptions?.사이즈.defaultKey).toBe("톨");

    expect(() =>
      PublicMenuDto.schema.parse({
        ...menuRowFixture(),
        requiredOptions: { 사이즈: { 잘못된: "구조" } },
      })
    ).toThrow();
  });
});
