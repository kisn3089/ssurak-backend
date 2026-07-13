export type NoticeLevel = "info" | "success" | "error";

/** 같은 이벤트라도 점주·고객에게 다른 문구를 노출한다. */
export type OrderNoticeMessage = {
  owner?: string;
  customer?: string;
};

/** 주문·장바구니 변경 시 함께 내려오는 안내. */
export type SyncNotice = {
  level: NoticeLevel;
  message: OrderNoticeMessage;
  sound?: boolean;
};

/** Socket.IO 주문 동기화 이벤트 페이로드. */
export type OrderSyncEvent = {
  notice: SyncNotice;
  tablePublicId: string;
};

/** Socket.IO 장바구니 동기화 이벤트 페이로드. */
export type CartSyncEvent = {
  notice?: SyncNotice;
  updatedAt: string;
};
