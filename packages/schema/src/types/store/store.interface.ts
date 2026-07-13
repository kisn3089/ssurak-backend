import type { CategoryWithMenusResponse } from "../category/category.interface";
import type { Table } from "../table/table.interface";

/** 매장 응답. 서버는 `id`·`ownerId`와 관계 필드를 제외하고 내려준다. */
export interface Store {
  publicId: string;
  name: string;
  phone: string | null;
  address: string;
  addressDetail: string | null;
  businessHours: string | null;
  description: string | null;
  isOpen: boolean;
  /** 주문 접수 시 고객에게 노출할 안내 메시지 */
  acceptedMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 고객 메뉴판 진입 시 내려오는 매장 컨텍스트.
 * 세션 토큰으로 테이블을 식별해 매장·카테고리·메뉴를 한 번에 실어 보낸다.
 */
export type StoreContextResponse = {
  table: Table & {
    store: Store & { categories: CategoryWithMenusResponse[] };
  };
};
