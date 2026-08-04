/** 옵션 그룹의 선택 방식 */
export const OptionSelectionType = {
  /** 그룹에서 하나만 고른다 (maxSelect는 항상 1) */
  SINGLE: "SINGLE",
  /** 그룹에서 minSelect~maxSelect 개를 고른다 */
  MULTIPLE: "MULTIPLE",
} as const;

export type OptionSelectionType =
  (typeof OptionSelectionType)[keyof typeof OptionSelectionType];

/** 선택지의 판매 상태. */
export const OptionChoiceState = {
  AVAILABLE: "AVAILABLE",
  /** 목록에는 보이지만 고를 수 없다 (품절 표시) */
  SOLD_OUT: "SOLD_OUT",
  /** 고객에게 아예 노출되지 않는다. 점주 콘솔에서만 보인다 */
  HIDDEN: "HIDDEN",
} as const;

export type OptionChoiceState =
  (typeof OptionChoiceState)[keyof typeof OptionChoiceState];

/**
 * 다른 그룹의 선택 결과로 이 그룹의 노출 여부를 정하는 규칙.
 * 표시 순서와 무관하게 의존성 순서로 평가되며, 순환 참조는 쓰기 시점에 거절된다.
 */
export type MenuOptionTriggerRule = {
  /** 조건이 되는 다른 그룹의 publicId */
  optionId: string;
  /** 그 그룹에서 이 중 하나라도 선택되면 조건 충족 (OR) */
  choiceIds: string[];
};

/** 규칙 간에는 AND. 빈 배열이거나 null이면 항상 노출된다. */
export type MenuOptionTrigger = MenuOptionTriggerRule[];

/** 메뉴 응답에 실리는 옵션 선택지 */
export interface MenuOptionChoice {
  publicId: string;
  name: string;
  priceDelta: number;
  quantityEnabled: boolean;
  maxQuantity: number;
  isDefault: boolean;
  sortOrder: number;
  state: OptionChoiceState;
}

/** 메뉴 응답에 실리는 옵션 그룹 */
export interface MenuOptionGroup {
  publicId: string;
  name: string;
  selectionType: OptionSelectionType;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  enabled: boolean;
  trigger: MenuOptionTrigger | null;
  choices: MenuOptionChoice[];
}

export type OptionSnapshotChoice = {
  choiceId: string;
  name: string;
  priceDelta: number;
  quantity: number;
};

export type OptionSnapshotGroup = {
  optionId: string;
  name: string;
  choices: OptionSnapshotChoice[];
};

/** 주문·장바구니가 들고 다니는 확정 스냅샷. */
export type OrderItemOptionSnapshot = { options: OptionSnapshotGroup[] };

/** 고객이 서버로 보내는 선택 페이로드 (장바구니·주문 공용) */
export type MenuOptionSelection = {
  optionId: string;
  choices: { choiceId: string; quantity: number }[];
};
