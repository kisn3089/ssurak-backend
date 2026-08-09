import type { MenuOptionGroup } from "./menuOptions.interface";

/** 메뉴 이미지의 슬롯별 CDN URL. 서버가 조립하므로 클라이언트는 key 규칙을 몰라도 된다. */
export interface MenuImages {
  /** 메뉴 상세 히어로 (780x585) */
  hero: string;
  /** 메뉴 리스트 썸네일 (240x240) */
  thumbnail: string;
}

/**
 * 메뉴 응답.
 * 서버는 `id`·`categoryId`와 관계 필드를 제외하고 내려준다.
 *
 * 옵션은 실리지 않는다 — 옵션이 바뀔 때마다 메뉴 캐시까지 무효화하지 않도록
 * `GET /stores/{storeId}/menus/{menuId}/options`로 따로 조회한다.
 */
export interface Menu {
  publicId: string;
  name: string;
  price: number;
  description: string | null;
  /** 이미지 미등록 시 null. S3 object key는 노출하지 않는다. */
  images: MenuImages | null;
  isAvailable: boolean;
  /** 카테고리 내 표시 순서 (Sparse 패턴: 10, 20, 30...) */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** 소프트 삭제 시각. 응답에 포함되지만 삭제된 메뉴는 조회에서 걸러지므로 항상 null이다. */
  deletedAt: string | null;
}

/**
 * 옵션을 함께 실은 메뉴. 고객 메뉴판 전용이다 —
 * 주문 화면은 한 번의 요청으로 전부 렌더해야 해서 옵션을 나눠 받을 이유가 없다.
 */
export interface MenuWithOptions extends Menu {
  /** 옵션 그룹 목록. 옵션이 없으면 빈 배열이며 null이 되지 않는다. */
  options: MenuOptionGroup[];
}
