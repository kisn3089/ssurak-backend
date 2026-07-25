import {
  MenuValidationFields,
  validateMenuMismatchOrThrow,
} from "../menu/mismatch";
import { Prisma } from "@ssurak/db";
import { getValidatedMenuOptionsSnapshot } from "../menu/options";
import { ExtendedMap } from "src/utils/helper/extendMap";
import { validateMenuAvailableOrThrow } from "../menu/available";
import { buildMenuImageUrls } from "src/common/image/menu-image";

export type ValidatableOrderItem = {
  menuPublicId: string;
  quantity: number;
  requiredOptions?: Record<string, string>;
  customOptions?: Record<string, string>;
};

export function createOrderItemsWithValidMenu(
  orderItems: ValidatableOrderItem[],
  findMenuList: MenuValidationFields[],
  menuPublicIds: string[],
  cdnBaseUrl: string
): Prisma.OrderItemCreateWithoutOrderInput[] {
  const menuMap = new ExtendedMap<string, MenuValidationFields>(
    findMenuList.map((menu) => [menu.publicId, menu])
  );
  menuMap.setException("MENU_MISMATCH");

  validateMenuMismatchOrThrow(findMenuList, menuPublicIds);

  const bulkCreateOrderItems: Prisma.OrderItemCreateNestedManyWithoutOrderInput["create"] =
    orderItems.map((orderItem) => {
      const menu = menuMap.getOrThrow(orderItem.menuPublicId);
      validateMenuAvailableOrThrow(menu);
      const { optionsPrice, optionsSnapshot } = getValidatedMenuOptionsSnapshot(
        menu,
        {
          requiredOptions: orderItem.requiredOptions,
          customOptions: orderItem.customOptions,
        }
      );

      return {
        menu: { connect: { publicId: orderItem.menuPublicId } },
        menuName: menu.name,
        menuImageUrl:
          buildMenuImageUrls(menu.imageKey, cdnBaseUrl)?.thumbnail ?? null,
        basePrice: menu.price,
        unitPrice: menu.price + optionsPrice,
        optionsPrice,
        quantity: orderItem.quantity,
        optionsSnapshot,
      };
    });

  return bulkCreateOrderItems;
}
