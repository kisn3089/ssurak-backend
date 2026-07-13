import type {
  MenuCustomOption,
  MenuRequiredOption,
} from "./menuOptions.interface";

/**
 * 메뉴 응답.
 * 서버는 `id`·`categoryId`와 관계 필드를 제외하고 내려준다.
 */
export interface Menu {
  publicId: string;
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
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
