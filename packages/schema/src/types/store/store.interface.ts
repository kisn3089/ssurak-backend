import type { StoreOpenState } from "../businessHour/businessHour.interface";
import type { CategoryWithMenusResponse } from "../category/category.interface";
import type { Table } from "../table/table.interface";

/** 매장 응답. 서버는 `id`·`ownerId`와 관계 필드를 제외하고 내려준다. */
export interface Store {
  publicId: string;
  name: string;
  phone: string | null;
  address: string;
  addressDetail: string | null;
  description: string | null;
  /**
   * 영업시간과 무관한 점주의 수동 스위치.
   * "지금 주문 가능한가"는 이 값이 아니라 `StoreOpenState.isOpen`으로 판단해야 한다.
   */
  isOpen: boolean;
  /** 주문 접수 시 고객에게 노출할 안내 메시지 */
  acceptedMessage: string | null;
  /** 영업시간 판정 기준 타임존 (예: "Asia/Seoul") */
  timezone: string;
  /** 영업일 경계 (자정 기준 분). 기본 300 = 새벽 5시 */
  businessDayCutoff: number;
  /** 주문번호 접두사. "A-0001"의 "A" */
  orderNumberPrefix: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 고객 메뉴판 진입 시 내려오는 매장 컨텍스트.
 * 세션 토큰으로 테이블을 식별해 매장·카테고리·메뉴를 한 번에 실어 보낸다.
 * `openState`를 함께 실어 보내 메뉴판 진입만으로 주문 가능 여부를 알 수 있게 한다.
 */
export type StoreContextResponse = {
  table: Table & {
    store: Store & {
      categories: CategoryWithMenusResponse[];
      openState: StoreOpenState;
    };
  };
};
