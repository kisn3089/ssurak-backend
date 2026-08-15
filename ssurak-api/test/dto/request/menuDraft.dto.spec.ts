import { describe, expect, it } from "vitest";
import {
  BULK_MENU_MAX,
  bulkCreateMenusPayloadSchema,
  PRICE_MAX,
} from "@ssurak/schema";

/** cuid2는 24자 이상이라 짧은 더미로는 스키마를 통과하지 못한다. */
const CATEGORY_ID = "clx1a2b3c4d5e6f7g8h9i0jk";

const item = (overrides: Record<string, unknown> = {}) => ({
  name: "김치찌개",
  price: 9000,
  categoryId: CATEGORY_ID,
  ...overrides,
});

const parse = (items: unknown[]) =>
  bulkCreateMenusPayloadSchema.safeParse({ items });

describe("bulkCreateMenusPayloadSchema — 카테고리 지정", () => {
  it("기존 카테고리만 지정하면 통과한다", () => {
    expect(parse([item()]).success).toBe(true);
  });

  it("새 카테고리 이름만 지정해도 통과한다", () => {
    expect(
      parse([item({ categoryId: undefined, categoryName: "구이류" })]).success
    ).toBe(true);
  });

  it("둘 다 보내면 거절한다 — 어느 쪽이 이기는지 모호해진다", () => {
    expect(parse([item({ categoryName: "구이류" })]).success).toBe(false);
  });

  it("둘 다 없으면 거절한다", () => {
    expect(parse([item({ categoryId: undefined })]).success).toBe(false);
  });
});

describe("bulkCreateMenusPayloadSchema — 도메인 제약", () => {
  it("초안에서 통과한 값이 여기서도 통과하도록 같은 길이 제약을 쓴다", () => {
    expect(parse([item({ name: "가".repeat(30) })]).success).toBe(true);
    expect(parse([item({ name: "가".repeat(31) })]).success).toBe(false);
  });

  it("가격 상한을 강제한다", () => {
    expect(parse([item({ price: PRICE_MAX })]).success).toBe(true);
    expect(parse([item({ price: PRICE_MAX + 1 })]).success).toBe(false);
  });

  it("소수점 가격은 거절한다 — DB에서 조용히 잘리는 것보다 낫다", () => {
    expect(parse([item({ price: 9000.5 })]).success).toBe(false);
  });

  it("초안의 미해결 항목(가격 null)은 확정 단계에서 막힌다", () => {
    expect(parse([item({ price: null })]).success).toBe(false);
  });

  it("isAvailable 기본값은 판매 중이다", () => {
    const parsed = bulkCreateMenusPayloadSchema.parse({ items: [item()] });
    expect(parsed.items[0].isAvailable).toBe(true);
  });
});

describe("bulkCreateMenusPayloadSchema — 크기", () => {
  it("빈 배열은 거절한다", () => {
    expect(parse([]).success).toBe(false);
  });

  it("상한을 넘는 요청은 거절한다 — 트랜잭션 예산 방어선이다", () => {
    const many = Array.from({ length: BULK_MENU_MAX + 1 }, () => item());
    expect(parse(many).success).toBe(false);
  });

  it("정의되지 않은 필드는 거절한다", () => {
    expect(parse([item({ sortOrder: 10 })]).success).toBe(false);
  });
});
