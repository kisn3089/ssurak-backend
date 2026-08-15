import { describe, expect, it } from "vitest";
import { NotFoundException } from "@nestjs/common";
import {
  PRICE_MAX,
  type MenuDraftItem,
  type MenuExtraction,
} from "@ssurak/schema";
import {
  recomputeMenuDraftIssues,
  reviseMenuDraftItems,
  toMenuDraft,
  type MenuDraftContext,
} from "src/stores/menu/menu-draft.mapper";

const item = (
  overrides: Partial<MenuExtraction["items"][number]> = {}
): MenuExtraction["items"][number] => ({
  name: "김치찌개",
  price: 9000,
  description: null,
  categoryName: null,
  ...overrides,
});

const extraction = (
  items: MenuExtraction["items"],
  unreadableCount = 0
): MenuExtraction => ({ items, unreadableCount });

const context = (
  overrides: Partial<MenuDraftContext> = {}
): MenuDraftContext => ({
  categories: [],
  existingMenuNames: [],
  ...overrides,
});

describe("toMenuDraft — 가격", () => {
  it("정상 가격은 이슈 없이 그대로 통과한다", () => {
    const { items } = toMenuDraft(
      extraction([item({ price: 9000 })]),
      context()
    );

    expect(items[0].price).toBe(9000);
    expect(items[0].issues).not.toContain("PRICE_MISSING");
    expect(items[0].issues).not.toContain("PRICE_OUT_OF_RANGE");
  });

  it("'시가'처럼 가격이 없으면 null + PRICE_MISSING으로 남긴다", () => {
    const { items } = toMenuDraft(
      extraction([item({ price: null })]),
      context()
    );

    expect(items[0].price).toBeNull();
    expect(items[0].issues).toContain("PRICE_MISSING");
  });

  it("상한을 넘는 가격은 클램프하지 않고 비운다", () => {
    // 자릿수 오인식(9,000 → 90000000)을 상한으로 맞춰 버리면 그럴듯한 틀린 값이
    // 남아 사장님이 그대로 저장한다. null이라야 빈 칸으로 눈에 걸린다.
    const { items } = toMenuDraft(
      extraction([item({ price: PRICE_MAX + 1 })]),
      context()
    );

    expect(items[0].price).toBeNull();
    expect(items[0].issues).toContain("PRICE_OUT_OF_RANGE");
  });

  it("음수 가격도 비운다", () => {
    const { items } = toMenuDraft(
      extraction([item({ price: -100 })]),
      context()
    );

    expect(items[0].price).toBeNull();
    expect(items[0].issues).toContain("PRICE_OUT_OF_RANGE");
  });

  it("소수점 가격은 원 단위로 반올림하고 표시를 남긴다", () => {
    const { items } = toMenuDraft(
      extraction([item({ price: 9000.6 })]),
      context()
    );

    expect(items[0].price).toBe(9001);
    expect(items[0].issues).toContain("PRICE_ROUNDED");
  });
});

describe("toMenuDraft — 길이 제약", () => {
  it("30자를 넘는 이름은 자르고 표시를 남긴다 (항목을 버리지 않는다)", () => {
    const long = "가".repeat(35);
    const { items } = toMenuDraft(
      extraction([item({ name: long })]),
      context()
    );

    expect(items).toHaveLength(1);
    expect(items[0].name).toHaveLength(30);
    expect(items[0].issues).toContain("NAME_TRUNCATED");
  });

  /**
   * 자르는 기준은 zod `.max()`와 같은 UTF-16 코드유닛이어야 한다. 코드포인트로 세면
   * 이모지 30개(=60 코드유닛)가 통과해 확정 단계에서 400으로 돌아온다.
   * 이모지 하나가 2 코드유닛이므로 30 코드유닛 = 이모지 15개다.
   */
  it("이모지가 섞인 이름을 잘라도 서로게이트 쌍이 깨지지 않는다", () => {
    const { items } = toMenuDraft(
      extraction([item({ name: "🍲".repeat(35) })]),
      context()
    );

    expect(items[0].name.length).toBeLessThanOrEqual(30);
    expect([...items[0].name]).toHaveLength(15);
    // 반토막 난 서로게이트는 U+FFFD로 복원되지 않고 깨진 코드유닛으로 남는다.
    expect(items[0].name).not.toContain("�");
  });

  it("100자를 넘는 설명은 자르고 표시를 남긴다", () => {
    const { items } = toMenuDraft(
      extraction([item({ description: "설".repeat(120) })]),
      context()
    );

    expect(items[0].description).toHaveLength(100);
    expect(items[0].issues).toContain("DESCRIPTION_TRUNCATED");
  });

  it("빈 설명은 null로 정리한다", () => {
    const { items } = toMenuDraft(
      extraction([item({ description: "   " })]),
      context()
    );

    expect(items[0].description).toBeNull();
    expect(items[0].issues).not.toContain("DESCRIPTION_TRUNCATED");
  });

  it("이름이 비어 있는 항목은 아예 내보내지 않는다", () => {
    const { items } = toMenuDraft(
      extraction([item({ name: "  " }), item({ name: "된장찌개" })]),
      context()
    );

    expect(items.map((menu) => menu.name)).toEqual(["된장찌개"]);
  });
});

describe("toMenuDraft — 카테고리 매칭", () => {
  const categories = [{ publicId: "cat-1", name: "찌개류" }];

  it("기존 카테고리와 이름이 맞으면 categoryId를 붙인다", () => {
    const { items } = toMenuDraft(
      extraction([item({ categoryName: "찌개류" })]),
      context({ categories })
    );

    expect(items[0].category).toEqual({
      kind: "existing",
      categoryId: "cat-1",
      name: "찌개류",
    });
    expect(items[0].issues).not.toContain("CATEGORY_UNKNOWN");
  });

  it("공백·대소문자 차이는 같은 카테고리로 본다", () => {
    const { items } = toMenuDraft(
      extraction([item({ categoryName: " 찌 개 류 " })]),
      context({ categories })
    );

    expect(items[0].category).toMatchObject({
      kind: "existing",
      categoryId: "cat-1",
    });
  });

  it("자모 분리(NFD)로 온 분류명도 기존 카테고리에 붙는다", () => {
    // 모델 출력과 DB 값의 유니코드 정규형이 다르면 눈에 같아 보여도 매칭이 어긋난다.
    const { items } = toMenuDraft(
      extraction([item({ categoryName: "찌개류".normalize("NFD") })]),
      context({ categories })
    );

    expect(items[0].category).toMatchObject({
      kind: "existing",
      categoryId: "cat-1",
    });
  });

  it("없는 분류명은 새로 만들 대상으로 표시한다", () => {
    const { items } = toMenuDraft(
      extraction([item({ categoryName: "구이류" })]),
      context({ categories })
    );

    expect(items[0].category).toEqual({ kind: "new", name: "구이류" });
    expect(items[0].issues).not.toContain("CATEGORY_UNKNOWN");
  });

  it("분류명이 없으면 미정으로 두고 표시를 남긴다", () => {
    const { items } = toMenuDraft(
      extraction([item({ categoryName: null })]),
      context({ categories })
    );

    expect(items[0].category).toEqual({ kind: "unknown" });
    expect(items[0].issues).toContain("CATEGORY_UNKNOWN");
  });

  it("20자를 넘어 저장할 수 없는 분류명은 new로 내보내지 않는다", () => {
    // 확정 단계에서 어차피 거절될 값을 초안에 남기면 저장 버튼을 눌러야 알게 된다.
    const { items } = toMenuDraft(
      extraction([item({ categoryName: "분".repeat(21) })]),
      context({ categories })
    );

    expect(items[0].category).toEqual({ kind: "unknown" });
    expect(items[0].issues).toContain("CATEGORY_UNKNOWN");
  });
});

describe("toMenuDraft — 중복", () => {
  it("매장에 이미 있는 메뉴명은 중복으로 표시한다", () => {
    // Menu에는 이름 unique가 없어 DB가 막아주지 않는다. 같은 메뉴판을 두 번 올리면
    // 여기서 잡지 않는 한 메뉴가 두 벌 생긴다.
    const { items } = toMenuDraft(
      extraction([item({ name: "김치찌개" })]),
      context({ existingMenuNames: ["김치찌개"] })
    );

    expect(items[0].issues).toContain("DUPLICATE_NAME");
  });

  it("여러 장에 걸친 같은 메뉴는 뒤에 온 쪽만 중복으로 표시한다", () => {
    const { items } = toMenuDraft(
      extraction([item({ name: "김치찌개" }), item({ name: "김치 찌개" })]),
      context()
    );

    expect(items[0].issues).not.toContain("DUPLICATE_NAME");
    expect(items[1].issues).toContain("DUPLICATE_NAME");
  });

  it("중복이라도 항목을 버리지 않는다 — 삭제 여부는 사장님이 정한다", () => {
    const { items } = toMenuDraft(
      extraction([item({ name: "공기밥" }), item({ name: "공기밥" })]),
      context()
    );

    expect(items).toHaveLength(2);
  });
});

describe("reviseMenuDraftItems — 사장님이 고친 항목", () => {
  const categories = [{ publicId: "cat-1", name: "찌개류" }];

  it("채워 넣은 값에서는 표시를 걷어낸다", () => {
    const [item] = reviseMenuDraftItems(
      [{ name: "김치찌개", price: 9000, categoryId: "cat-1" }],
      context({ categories })
    );

    expect(item.issues).toEqual([]);
    expect(item.category).toEqual({
      kind: "existing",
      categoryId: "cat-1",
      name: "찌개류",
    });
  });

  it("아직 안 정한 값에는 표시를 다시 붙인다", () => {
    // 클라이언트가 issues를 지워 보내도 서버가 다시 계산하므로 화면과 저장이 어긋나지 않는다.
    const [item] = reviseMenuDraftItems(
      [{ name: "된장찌개", price: null }],
      context({ categories })
    );

    expect(item.issues).toEqual(
      expect.arrayContaining(["PRICE_MISSING", "CATEGORY_UNKNOWN"])
    );
    expect(item.category).toEqual({ kind: "unknown" });
  });

  it("이름으로 보냈어도 매장에 있으면 기존 카테고리에 붙인다", () => {
    const [item] = reviseMenuDraftItems(
      [{ name: "김치찌개", price: 9000, categoryName: "찌개류" }],
      context({ categories })
    );

    expect(item.category).toEqual({
      kind: "existing",
      categoryId: "cat-1",
      name: "찌개류",
    });
  });

  it("매장에 없는 이름은 새로 만들 대상으로 남긴다", () => {
    const [item] = reviseMenuDraftItems(
      [{ name: "삼겹살", price: 15000, categoryName: "구이류" }],
      context({ categories })
    );

    expect(item.category).toEqual({ kind: "new", name: "구이류" });
  });

  it("다른 매장의 카테고리 ID는 거절한다", () => {
    // 초안에 심어두면 확정 단계에서야 터진다.
    expect(() =>
      reviseMenuDraftItems(
        [{ name: "김치찌개", price: 9000, categoryId: "cat-other" }],
        context({ categories })
      )
    ).toThrow(NotFoundException);
  });

  it("매장에 이미 있는 이름은 중복으로 표시한다", () => {
    const [item] = reviseMenuDraftItems(
      [{ name: "김치찌개", price: 9000, categoryId: "cat-1" }],
      context({ categories, existingMenuNames: ["김치찌개"] })
    );

    expect(item.issues).toContain("DUPLICATE_NAME");
  });

  it("빈 설명은 null로 정리한다", () => {
    const [item] = reviseMenuDraftItems(
      [
        {
          name: "김치찌개",
          price: 9000,
          description: "  ",
          categoryId: "cat-1",
        },
      ],
      context({ categories })
    );

    expect(item.description).toBeNull();
  });
});

describe("toMenuDraft — unreadableCount", () => {
  it("음수·소수를 그대로 흘려보내지 않는다", () => {
    expect(toMenuDraft(extraction([], -3), context()).unreadableCount).toBe(0);
    expect(toMenuDraft(extraction([], 2.7), context()).unreadableCount).toBe(2);
  });

  it("메뉴를 못 찾아도 빈 목록으로 정상 응답한다", () => {
    const draft = toMenuDraft(extraction([], 5), context());

    expect(draft.items).toEqual([]);
    expect(draft.unreadableCount).toBe(5);
  });
});

describe("recomputeMenuDraftIssues", () => {
  const stored = (overrides: Partial<MenuDraftItem> = {}): MenuDraftItem => ({
    name: "김치찌개",
    price: 9000,
    description: null,
    category: { kind: "unknown" },
    issues: [],
    ...overrides,
  });

  it("매장에 이미 있는 이름이면 중복 표시를 붙인다", () => {
    // 확정을 마친 초안을 표시 없이 그대로 주면 사장님이 한 번 더 확정한다.
    const [item] = recomputeMenuDraftIssues(
      [stored({ category: { kind: "new", name: "찌개류" } })],
      context({ existingMenuNames: ["김치찌개"] })
    );

    expect(item.issues).toContain("DUPLICATE_NAME");
  });

  it("확정하며 생긴 카테고리에는 새로 만들지 않고 붙는다", () => {
    const [item] = recomputeMenuDraftIssues(
      [stored({ category: { kind: "new", name: "찌개류" } })],
      context({ categories: [{ publicId: "cat-1", name: "찌개류" }] })
    );

    expect(item.category).toEqual({
      kind: "existing",
      categoryId: "cat-1",
      name: "찌개류",
    });
  });

  it("그 사이 지워진 카테고리는 404가 아니라 미정으로 되돌린다", () => {
    // 사진 재업로드가 카테고리 삭제 때문에 실패하면 사장님이 할 수 있는 게 없다.
    const [item] = recomputeMenuDraftIssues(
      [
        stored({
          category: { kind: "existing", categoryId: "gone", name: "사라짐" },
        }),
      ],
      context()
    );

    expect(item.category).toEqual({ kind: "unknown" });
    expect(item.issues).toContain("CATEGORY_UNKNOWN");
  });

  it("서버가 값을 손댔다는 기록은 지우지 않는다", () => {
    // NAME_TRUNCATED는 지금 값만 보고 되살릴 수 없다. 사장님이 아직 확인하지 않은 표시다.
    const [item] = recomputeMenuDraftIssues(
      [
        stored({
          issues: ["NAME_TRUNCATED", "PRICE_ROUNDED", "CATEGORY_UNKNOWN"],
          category: { kind: "existing", categoryId: "cat-1", name: "찌개류" },
        }),
      ],
      context({ categories: [{ publicId: "cat-1", name: "찌개류" }] })
    );

    expect(item.issues).toEqual(["NAME_TRUNCATED", "PRICE_ROUNDED"]);
  });

  it("값 자체는 건드리지 않는다 — 사장님이 PATCH로 고쳐둔 내용이다", () => {
    const [item] = recomputeMenuDraftIssues(
      [stored({ name: "직접 고친 이름", price: 12_000 })],
      context()
    );

    expect(item).toMatchObject({ name: "직접 고친 이름", price: 12_000 });
  });
});
