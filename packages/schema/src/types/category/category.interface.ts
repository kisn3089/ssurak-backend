import type { MenuWithOptions } from "../menu/menu.interface";

/**
 * 카테고리 응답.
 *
 * 카테고리가 실려 나가는 두 경로의 교집합만 선언한다.
 * 점주 메뉴 목록(`GET /stores/{storeId}/menus`)은 `createdAt`·`updatedAt`까지 내려주지만,
 * 고객 매장 컨텍스트는 DTO에서 그 둘을 제외하므로 공통 필드만 신뢰할 수 있다.
 */
export interface Category {
  id: bigint;
  publicId: string;
  name: string;
  /** 카테고리 표시 순서 (Sparse 패턴: 10, 20, 30...) */
  sortOrder: number;
}

/** 카테고리 + 판매 중인 메뉴 목록. 고객 메뉴판 조회에서만 사용한다(옵션 포함). */
export type CategoryWithMenusResponse = Category & {
  menus: MenuWithOptions[];
};

/**
 * 점주 카테고리 CRUD 응답(`/stores/{storeId}/categories`).
 * 내부 `id`는 노출하지 않고, 대신 메뉴판 응답에는 없는 타임스탬프를 실어 준다.
 */
export type CategoryResponse = Omit<Category, "id"> & {
  createdAt: string;
  updatedAt: string;
};
