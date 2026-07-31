import { describe, expect, it } from "vitest";
import { CATEGORIES } from "src/common/query/session-query.const";

const SORT_THEN_ID = [{ sortOrder: "asc" }, { id: "asc" }];

/**
 * 재정렬 설계는 "동시 생성으로 sortOrder가 겹쳐도 id 타이브레이크로 결정적"이라는
 * 전제 위에 있다. 고객 메뉴판 조회가 이 전제를 안 지키면 같은 데이터로도 요청마다
 * 순서가 뒤집힌다 — 기존 데이터의 sortOrder 기본값 0이 겹친 경우도 마찬가지다.
 */
describe("CATEGORIES", () => {
  it("카테고리를 sortOrder → id 순으로 정렬한다", () => {
    expect(CATEGORIES.orderBy).toEqual(SORT_THEN_ID);
  });

  it("카테고리에 딸린 메뉴도 sortOrder → id 순으로 정렬한다", () => {
    expect(CATEGORIES.include.menus.orderBy).toEqual(SORT_THEN_ID);
  });
});
