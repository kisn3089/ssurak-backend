/**
 * 옵션 서브시스템이 주고받는 모든 id는 publicId(cuid2)다. 내부 BigInt id는 노출되지 않는다.
 * packages/schema/src/types/menu/menuOptions.interface.ts 와 의도적으로 동일한 내용을 유지한다
 * (schema 패키지는 @ssurak/db에 의존하지 않는다).
 */

/** 다른 그룹의 선택 결과로 이 그룹의 노출 여부를 정하는 규칙 */
export type MenuOptionTriggerRule = {
  /** 조건이 되는 다른 그룹의 publicId */
  optionId: string;
  /** 그 그룹에서 이 중 하나라도 선택되면 조건 충족 (OR) */
  choiceIds: string[];
};

/** 규칙 간에는 AND. 빈 배열이거나 null이면 항상 노출된다. */
export type MenuOptionTrigger = MenuOptionTriggerRule[];

export type OptionSnapshotChoice = {
  choiceId: string;
  name: string;
  /** 개당 금액. quantity와 곱해진 값이 optionsPrice에 들어간다. */
  priceDelta: number;
  quantity: number;
};

export type OptionSnapshotGroup = {
  optionId: string;
  name: string;
  choices: OptionSnapshotChoice[];
};

/**
 * 주문·장바구니가 들고 다니는 확정 스냅샷.
 * 메뉴 쪽 옵션이 바뀌거나 삭제돼도 과거 주문이 그대로 렌더된다.
 * 배열을 그대로 두지 않고 객체로 감싼 이유는 이후 필드 추가가 가산적이도록 하기 위함이다.
 */
export type OrderItemOptionSnapshot = { options: OptionSnapshotGroup[] };

/** 고객이 서버로 보내는 선택 페이로드 (장바구니·주문 공용) */
export type MenuOptionSelection = {
  optionId: string;
  choices: { choiceId: string; quantity: number }[];
};
