export type OrderNoticeMessage = {
  owner?: string;
  customer?: string;
};

export type NoticeLevel = "info" | "success" | "error";

export type SyncNotice = {
  level: NoticeLevel;
  message: OrderNoticeMessage;
  sound?: boolean;
};

export type OrderSyncEvent = {
  notice: SyncNotice;
  tablePublicId: string;
};

export type CartSyncEvent = {
  notice?: SyncNotice;
  updatedAt: string;
};
