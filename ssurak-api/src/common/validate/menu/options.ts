import { HttpException, HttpStatus } from "@nestjs/common";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { ExtendedMap } from "src/utils/helper/extendMap";
import { menuOptionsPayloadSchema } from "@ssurak/schema";
import type {
  OptionSnapshotValue,
  MenuCustomOptionValue,
  MenuOption,
  MenuRequiredOptionValue,
  OrderItemOptionSnapshot,
} from "@ssurak/schema";

type JsonMenuOptions = { requiredOptions: unknown; customOptions: unknown };
export type PayloadOptions = {
  requiredOptions?: Record<string, string>;
  customOptions?: Record<string, string>;
};
type ValidatedMenuOptionsReturn = {
  optionsSnapshot: OptionSnapshotValue;
  optionsPrice: number;
};
export type GetValidatedMenuOptionsSnapshotReturn = {
  optionsSnapshot?: {
    requiredOptions?: OptionSnapshotValue;
    customOptions?: OptionSnapshotValue;
  };
  optionsPrice: number;
};

function parseMenuOptions(menu: JsonMenuOptions): MenuOption {
  return menuOptionsPayloadSchema.parse({
    requiredOptions: menu.requiredOptions,
    customOptions: menu.customOptions,
  });
}

function getValidatedMenuOptions<
  ValidMenuOption extends MenuRequiredOptionValue | MenuCustomOptionValue,
>(
  menuOption: Record<string, ValidMenuOption> | null,
  payloadOption: Record<string, string> = {}
): ValidatedMenuOptionsReturn {
  const menuOptionsMap = new ExtendedMap<string, ValidMenuOption>(
    Object.entries(menuOption || {})
  );
  const payloadMenuMap = new Map<string, string>(
    Object.entries(payloadOption || {})
  );

  menuOptionsMap.setException("MENU_OPTIONS_INVALID");

  const validatedOptions: ValidatedMenuOptionsReturn = {
    optionsPrice: 0,
    optionsSnapshot: {},
  };
  payloadMenuMap.forEach((payloadValue, payloadKey) => {
    const menuOptions = menuOptionsMap.getOrThrow(payloadKey);
    const findOption = menuOptions.options.find(
      (option) => option.key === payloadValue
    );

    if (!findOption) {
      throw new HttpException(
        {
          ...exceptionContentsIs("MENU_OPTIONS_INVALID"),
          details: { key: payloadKey, invalidOption: payloadValue },
        },
        HttpStatus.BAD_REQUEST
      );
    }

    validatedOptions.optionsPrice += findOption.price;
    validatedOptions.optionsSnapshot[payloadKey] = findOption;
  });
  return validatedOptions;
}

/**
 * 주문 아이템 optionsSnapshot에서 고객이 선택했던 값(그룹명 → 옵션 key)을 복원한다.
 * 옵션 부분 업데이트 시 페이로드에 없는 그룹을 기존 선택으로 채우는 데 사용한다.
 */
export function extractSelectionsFromSnapshot(
  snapshot: OrderItemOptionSnapshot | null | undefined
): PayloadOptions {
  const toSelections = (
    options?: OptionSnapshotValue
  ): Record<string, string> | undefined => {
    if (!options || Object.keys(options).length === 0) return undefined;
    return Object.fromEntries(
      Object.entries(options).map(([group, option]) => [group, option.key])
    );
  };

  return {
    requiredOptions: toSelections(snapshot?.requiredOptions),
    customOptions: toSelections(snapshot?.customOptions),
  };
}

export function getValidatedMenuOptionsSnapshot(
  menuOptions: JsonMenuOptions,
  payloadOptions: PayloadOptions
): GetValidatedMenuOptionsSnapshotReturn {
  const parsedMenuOptions: MenuOption = parseMenuOptions(menuOptions);
  const {
    customOptions: payloadCustomOptions,
    requiredOptions: payloadRequiredOptions,
  } = payloadOptions;

  const requiredMenuOptionsKeys = Object.keys(
    parsedMenuOptions.requiredOptions || {}
  );
  const payloadRequiredOptionsKeys = Object.keys(payloadRequiredOptions || {});

  const missingRequiredOptionsKeys = requiredMenuOptionsKeys.filter(
    (key) => !payloadRequiredOptionsKeys.includes(key)
  );

  if (missingRequiredOptionsKeys.length > 0) {
    throw new HttpException(
      {
        ...exceptionContentsIs("MENU_OPTIONS_REQUIRED"),
        details: {
          missingRequiredOptions: missingRequiredOptionsKeys,
        },
      },
      HttpStatus.BAD_REQUEST
    );
  }

  const payloadCustomOptionsKeys = Object.keys(payloadCustomOptions || {});
  if (!parsedMenuOptions.customOptions && payloadCustomOptionsKeys.length > 0) {
    throw new HttpException(
      {
        ...exceptionContentsIs("MENU_OPTIONS_SHOULD_BE_EMPTY"),
        details: {
          shouldBeEmptyOptions: payloadCustomOptionsKeys,
        },
      },
      HttpStatus.BAD_REQUEST
    );
  }

  const {
    optionsPrice: requiredOptionsPrice,
    optionsSnapshot: requiredOptionsSnapshot,
  } = getValidatedMenuOptions<MenuRequiredOptionValue>(
    parsedMenuOptions.requiredOptions,
    payloadRequiredOptions
  );

  const {
    optionsPrice: customOptionsPrice,
    optionsSnapshot: customOptionsSnapshot,
  } = getValidatedMenuOptions<MenuCustomOptionValue>(
    parsedMenuOptions.customOptions,
    payloadCustomOptions
  );

  const mergedOptionsSnapshot = {
    ...requiredOptionsSnapshot,
    ...customOptionsSnapshot,
  };

  return {
    ...(Object.keys(mergedOptionsSnapshot).length
      ? {
          optionsSnapshot: {
            requiredOptions: requiredOptionsSnapshot,
            customOptions: customOptionsSnapshot,
          },
        }
      : undefined),
    optionsPrice: requiredOptionsPrice + customOptionsPrice,
  };
}
