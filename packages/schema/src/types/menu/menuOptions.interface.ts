export type MenuOptionValue = {
  key: string;
  description?: string;
  price: number;
};

export type MenuRequiredOptionValue = {
  options: MenuOptionValue[];
  defaultKey: string;
};

export type MenuCustomOptionValue = {
  options: MenuOptionValue[];
  trigger?: { group: string; in: string[] }[];
  defaultKey: string;
};

export type MenuRequiredOption = Record<string, MenuRequiredOptionValue>;
export type MenuCustomOption = Record<string, MenuCustomOptionValue>;

export type MenuOptionEntry<
  OptionType extends "required" | "custom" = "required",
> = {
  key: string;
  optionInfo: OptionType extends "required"
    ? MenuRequiredOptionValue
    : MenuCustomOptionValue;
};

export type MenuOption = {
  requiredOptions: MenuRequiredOption | null;
  customOptions: MenuCustomOption | null;
};

export type OptionSnapshotValue = Record<string, MenuOptionValue>;
export type OrderItemOptionSnapshot = {
  requiredOptions?: OptionSnapshotValue;
  customOptions?: OptionSnapshotValue;
};
