/** 소프트 삭제된 메뉴를 되돌릴 수 있는 기간. */
export const MENU_RETENTION_DAYS = 3;

export const MENU_RETENTION_MS = MENU_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** 한 번의 배치가 처리할 최대 메뉴 수. 밀린 분량은 다음 실행이 이어서 처리한다. */
export const MENU_PURGE_BATCH_SIZE = 200;

/** 지금부터 보관 기간만큼 이전 시각. 이보다 오래된 삭제는 회수 대상이다. */
export const retentionCutoff = (): Date =>
  new Date(Date.now() - MENU_RETENTION_MS);
