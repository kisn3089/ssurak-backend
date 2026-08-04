import type {
  Admin,
  Menu,
  MenuOptionChoice,
  MenuOptionGroup,
  Order,
  OrderItem,
  Owner,
  Store,
  Table,
  TableSession,
} from "@prisma/client";
import { OrderItemOptionSnapshot } from "./menuOptions.type";

export type PublicAdmin = Omit<Admin, "id" | "password">;
export type PublicOwner = Omit<Owner, "id" | "password">;
export type PublicUser = PublicOwner | PublicAdmin;

export type PublicTable = Omit<Table, "id" | "storeId">;

export type PublicSession = Omit<TableSession, "id" | "tableId">;
export type PublicSessionWithTable<
  Option extends "Narrow" | "Wide" = "Narrow",
> = Omit<TableSession, "id" | "tableId"> & {
  table: PublicTable;
  orders: Array<PublicOrder & { orderItems?: PublicOrderItem<Option>[] }>;
};

export type PublicOrder = Omit<
  Order,
  "id" | "storeId" | "tableId" | "tableSessionId"
>;

type PublicizeOrderItem = Omit<OrderItem, "id" | "orderId" | "menuId">;
export type PublicOrderItem<Option extends "Narrow" | "Wide" = "Narrow"> =
  Option extends "Narrow"
    ? Omit<PublicizeOrderItem, "optionsSnapshot"> & {
        optionsSnapshot?: OrderItemOptionSnapshot | null;
      }
    : PublicizeOrderItem;

export type PublicMenu = Omit<Menu, "id">;

export type PublicMenuOptionChoice = Omit<
  MenuOptionChoice,
  "id" | "optionGroupId"
>;

export type PublicMenuOptionGroup = Omit<MenuOptionGroup, "id" | "menuId"> & {
  choices: PublicMenuOptionChoice[];
};

export type PublicMenuWithOptions = PublicMenu & {
  options: PublicMenuOptionGroup[];
};

export type PublicStore = Omit<Store, "id" | "ownerId">;

export type PublicOrderWithItem<
  Option extends "Narrow" | "Wide" = "Narrow",
  Session extends Partial<PublicSession> | undefined = undefined,
> = PublicOrder & {
  orderItems: PublicOrderItem<Option>[];
} & (Session extends Partial<PublicSession>
    ? { tableSession: Session }
    : unknown);
