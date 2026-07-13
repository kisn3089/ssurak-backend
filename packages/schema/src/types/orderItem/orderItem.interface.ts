import type { OrderItemOptionSnapshot } from "../menu/menuOptions.interface";

/**
 * 주문 항목 응답. 서버는 `id`·`orderId`·`menuId`와 관계 필드를 제외하고 내려준다.
 * 주문 시점의 메뉴 정보를 스냅샷으로 복제해 보관한다.
 */
export interface OrderItem {
  publicId: string;
  menuName: string;
  menuImageUrl: string | null;
  basePrice: number;
  optionsPrice: number;
  /** 단가 (기본 가격 + 옵션 가격) */
  unitPrice: number;
  quantity: number;
  /** 고객이 선택한 필수·선택 옵션 스냅샷 */
  optionsSnapshot: OrderItemOptionSnapshot | null;
  createdAt: string;
}
