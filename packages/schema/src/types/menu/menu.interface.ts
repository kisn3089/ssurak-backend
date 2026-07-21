import type {
  MenuCustomOption,
  MenuRequiredOption,
} from "./menuOptions.interface";

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
  requiredOptions: MenuRequiredOption | null;
  customOptions: MenuCustomOption | null;
  createdAt: string;
  updatedAt: string;
  /** 소프트 삭제 시각. 응답에 포함되지만 삭제된 메뉴는 조회에서 걸러지므로 항상 null이다. */
  deletedAt: string | null;
}
