import { HttpException, HttpStatus } from "@nestjs/common";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { OptionChoiceState } from "@ssurak/db";
import type {
  MenuOptionSelection,
  MenuOptionTrigger,
  OptionSnapshotGroup,
  OrderItemOptionSnapshot,
} from "@ssurak/schema";
import type { MenuValidationFields } from "./mismatch";

type MenuOptionGroupFields = MenuValidationFields["options"][number];
type MenuOptionChoiceFields = MenuOptionGroupFields["choices"][number];
type SelectedChoice = MenuOptionSelection["choices"][number];

export type ValidatedMenuOptions = {
  /** 선택이 하나도 없으면 생략한다. 스냅샷 없는 주문 항목과 빈 스냅샷을 구분하지 않는다. */
  optionsSnapshot?: OrderItemOptionSnapshot;
  /** 메뉴 1개당 옵션 합계. unitPrice = menu.price + optionsPrice */
  optionsPrice: number;
};

export type ValidateMenuOptionsContext = {
  explicitOptionIds?: Set<string>;
};

/** 페이로드가 직접 보낸 optionId 집합. 병합으로 딸려온 저장된 선택과 구분하는 데 쓴다. */
export function explicitOptionIdsOf(
  patch: MenuOptionSelection[] | undefined
): Set<string> {
  return new Set((patch ?? []).map((selection) => selection.optionId));
}

function optionsException(
  code: Parameters<typeof exceptionContentsIs>[0],
  details: Record<string, unknown>
): HttpException {
  return new HttpException(
    { ...exceptionContentsIs(code), details },
    HttpStatus.BAD_REQUEST
  );
}

/** 트리거 충족 여부. 규칙 간에는 AND, 한 규칙의 choiceIds 안에서는 OR다. */
function isTriggerSatisfied(
  trigger: MenuOptionTrigger | null,
  acceptedChoiceIdsOf: (optionId: string) => Set<string> | undefined
): boolean {
  if (!trigger?.length) return true;

  return trigger.every((rule) => {
    const accepted = acceptedChoiceIdsOf(rule.optionId);
    if (!accepted) return false;
    return rule.choiceIds.some((choiceId) => accepted.has(choiceId));
  });
}

function assertChoiceSelectable(
  choice: MenuOptionChoiceFields,
  quantity: number,
  optionId: string
): void {
  // HIDDEN은 존재 자체를 흘리지 않는다 — 없는 선택지와 같은 코드로 응답한다.
  if (choice.state === OptionChoiceState.HIDDEN) {
    throw optionsException("MENU_OPTIONS_INVALID", {
      optionId,
      invalidChoiceId: choice.publicId,
    });
  }

  if (choice.state === OptionChoiceState.SOLD_OUT) {
    throw optionsException("MENU_OPTION_CHOICE_SOLD_OUT", {
      optionId,
      choiceId: choice.publicId,
      name: choice.name,
    });
  }

  // quantityEnabled가 꺼진 선택지는 maxQuantity가 1로 강제돼 있지만, 의미가 다른 두
  // 조건이라 각각 확인한다(수량 기능 자체를 안 쓰는 것 vs 상한을 넘긴 것).
  const overLimit = quantity < 1 || quantity > choice.maxQuantity;
  if (overLimit || (!choice.quantityEnabled && quantity !== 1)) {
    throw optionsException("MENU_OPTION_QUANTITY_INVALID", {
      choiceId: choice.publicId,
      quantity,
      maxQuantity: choice.maxQuantity,
      quantityEnabled: choice.quantityEnabled,
    });
  }
}

/** 그룹 하나를 검증해 스냅샷과 가격을 만든다. */
function validateGroupSelection(
  group: MenuOptionGroupFields,
  picked: SelectedChoice[]
): { snapshot: OptionSnapshotGroup; price: number } {
  if (picked.length < group.minSelect || picked.length > group.maxSelect) {
    throw optionsException("MENU_OPTION_SELECT_COUNT_INVALID", {
      optionId: group.publicId,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      selected: picked.length,
    });
  }

  const quantityByChoiceId = new Map(
    picked.map((choice) => [choice.choiceId, choice.quantity])
  );
  let price = 0;
  const choices: OptionSnapshotGroup["choices"] = [];

  group.choices.forEach((choice) => {
    const quantity = quantityByChoiceId.get(choice.publicId);
    if (quantity === undefined) return;

    assertChoiceSelectable(choice, quantity, group.publicId);
    quantityByChoiceId.delete(choice.publicId);

    price += choice.priceDelta * quantity;
    choices.push({
      choiceId: choice.publicId,
      name: choice.name,
      priceDelta: choice.priceDelta,
      quantity,
    });
  });

  // 메뉴에 없는 선택지를 보낸 경우 위 순회에서 걸리지 않으므로 남은 것으로 판정한다.
  const [unknownChoiceId] = quantityByChoiceId.keys();
  if (unknownChoiceId !== undefined) {
    throw optionsException("MENU_OPTIONS_INVALID", {
      optionId: group.publicId,
      invalidChoiceId: unknownChoiceId,
    });
  }

  return {
    snapshot: { optionId: group.publicId, name: group.name, choices },
    price,
  };
}

/** 그룹 하나를 해석한 결과. 스냅샷이 없으면 노출되지 않았거나 아무것도 안 고른 그룹이다. */
type ResolvedGroup = {
  snapshot?: OptionSnapshotGroup;
  price: number;
};

/** 고객이 보낸 옵션 선택을 메뉴 정의와 대조해 확정 스냅샷과 가격을 만든다. */
export function getValidatedMenuOptionsSnapshot(
  menu: MenuValidationFields,
  selections: MenuOptionSelection[] | undefined,
  { explicitOptionIds }: ValidateMenuOptionsContext = {}
): ValidatedMenuOptions {
  /** 생략됐으면 전부 직접 보낸 것으로 본다 — 생성 경로는 병합할 저장값이 없다. */
  const isExplicit = (optionId: string): boolean =>
    explicitOptionIds === undefined || explicitOptionIds.has(optionId);

  const selectionByOptionId = new Map(
    (selections ?? []).map((selection) => [selection.optionId, selection])
  );
  const groupById = new Map(
    menu.options.map((group) => [group.publicId, group])
  );
  const resolved = new Map<string, ResolvedGroup>();
  const visiting = new Set<string>();

  const resolve = (group: MenuOptionGroupFields): ResolvedGroup => {
    const cached = resolved.get(group.publicId);
    if (cached) return cached;

    visiting.add(group.publicId);
    const result = resolveGroup(group);
    visiting.delete(group.publicId);

    resolved.set(group.publicId, result);
    return result;
  };

  /** 트리거가 참조하는 그룹에서 실제로 확정된 선택지들. 필요한 그룹만 먼저 해석한다. */
  const acceptedChoiceIdsOf = (optionId: string): Set<string> | undefined => {
    // 순환이면 여기서 멈춘다. 조건을 못 만족한 것으로 보고 그룹을 노출하지 않는다.
    if (visiting.has(optionId)) return undefined;

    const referenced = groupById.get(optionId);
    if (!referenced) return undefined;

    const snapshot = resolve(referenced).snapshot;
    if (!snapshot) return undefined;

    return new Set(snapshot.choices.map((choice) => choice.choiceId));
  };

  function resolveGroup(group: MenuOptionGroupFields): ResolvedGroup {
    const picked = selectionByOptionId.get(group.publicId)?.choices ?? [];

    // 고를 수 없는 그룹에 선택이 남아 있어도, 그게 저장된 잔재라면 조용히 버린다.
    const droppable = picked.length === 0 || !isExplicit(group.publicId);

    if (!group.enabled) {
      if (droppable) return { price: 0 };
      throw optionsException("MENU_OPTION_GROUP_DISABLED", {
        optionId: group.publicId,
      });
    }

    if (!isTriggerSatisfied(group.trigger, acceptedChoiceIdsOf)) {
      if (droppable) return { price: 0 };
      throw optionsException("MENU_OPTION_TRIGGER_UNSATISFIED", {
        optionId: group.publicId,
      });
    }

    if (picked.length === 0) {
      if (!group.required) return { price: 0 };
      throw optionsException("MENU_OPTIONS_REQUIRED", {
        missingOptionIds: [group.publicId],
      });
    }

    return validateGroupSelection(group, picked);
  }

  const options: OptionSnapshotGroup[] = [];
  let optionsPrice = 0;

  menu.options.forEach((group) => {
    const { snapshot, price } = resolve(group);
    optionsPrice += price;
    if (snapshot) options.push(snapshot);
    selectionByOptionId.delete(group.publicId);
  });

  const [unknownOptionId] = [...selectionByOptionId.keys()].filter(isExplicit);
  if (unknownOptionId !== undefined) {
    throw optionsException("MENU_OPTIONS_INVALID", { unknownOptionId });
  }

  // priceDelta가 음수일 수 있으므로(할인 옵션) 단가가 음수로 내려가는지 확인한다.
  if (menu.price + optionsPrice < 0) {
    throw optionsException("MENU_OPTION_PRICE_UNDERFLOW", {
      price: menu.price,
      optionsPrice,
    });
  }

  return {
    ...(options.length ? { optionsSnapshot: { options } } : undefined),
    optionsPrice,
  };
}

/**
 * 확정 스냅샷을 선택 페이로드로 되돌린다.
 * 옵션 부분 업데이트에서 페이로드에 없는 그룹을 기존 선택으로 채우는 데 쓴다.
 */
export function extractSelectionsFromSnapshot(
  snapshot: OrderItemOptionSnapshot | null | undefined
): MenuOptionSelection[] | undefined {
  if (!snapshot?.options.length) return undefined;

  return snapshot.options.map((group) => ({
    optionId: group.optionId,
    choices: group.choices.map(({ choiceId, quantity }) => ({
      choiceId,
      quantity,
    })),
  }));
}

/**
 * 그룹 단위 병합. 페이로드에 있는 optionId는 통째로 덮어쓰고, 없는 그룹은 기존 선택을
 * 유지한다. 특정 그룹의 선택을 비우려면 `{ optionId, choices: [] }`를 보낸다.
 */
export function mergeSelections(
  base: MenuOptionSelection[] | undefined,
  patch: MenuOptionSelection[] | undefined
): MenuOptionSelection[] | undefined {
  if (!patch) return base;

  const merged = new Map(
    (base ?? []).map((selection) => [selection.optionId, selection])
  );
  patch.forEach((selection) => merged.set(selection.optionId, selection));

  const selections = [...merged.values()];
  return selections.length ? selections : undefined;
}
