import type { OrderItem } from "../orderItem/orderItem.interface";
import type { SyncNotice } from "../realtime/syncNotice.interface";

/**
 * 장바구니 항목 응답.
 *
 * 장바구니는 DB가 아닌 Redis에 세션 단위로 보관되므로 대응하는 테이블이 없다.
 * 주문 항목과 가격·수량 필드를 공유하되, 아직 주문 전이라 `publicId`·`createdAt`이 없고
 * 옵션은 스냅샷 대신 선택한 key만 담는다.
 *
 * 여기의 `id`는 DB의 내부 id가 아니라 Redis가 발급한 장바구니 항목 식별자다.
 */
export type CartItem = Omit<
  OrderItem,
  "publicId" | "createdAt" | "optionsSnapshot"
> & {
  id: string;
  menuPublicId: string;
  requiredOptions?: Record<string, string>;
  customOptions?: Record<string, string>;
  addedAt: string;
  /** 옵션 조합 식별 지문. 동일 옵션 항목을 합산하는 기준이 된다. */
  fingerprint: string;
};

/** 장바구니 응답. */
export type Cart = {
  sessionToken: string;
  menus: CartItem[];
  updatedAt: string;
};

/** 장바구니 변경 응답. 변경 안내가 항상 함께 온다. */
export type CartWithNoticeResponse = {
  cart: Cart;
  notice: SyncNotice;
};

/** 장바구니 변경 응답. 변경 사항이 없으면 안내가 생략된다. */
export type CartWithOptionalNoticeResponse = {
  cart: Cart;
  notice?: SyncNotice;
};
