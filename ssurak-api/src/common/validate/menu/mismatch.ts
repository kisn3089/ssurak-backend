import { HttpException, HttpStatus } from "@nestjs/common";
import { exceptionContentsIs } from "../../constants/exceptionContents";
import { Menu } from "@ssurak/db";

export type MenuValidationFields = Pick<
  Menu,
  | "id"
  | "publicId"
  | "name"
  | "price"
  | "imageUrl"
  | "requiredOptions"
  | "customOptions"
  | "isAvailable"
>;

export function validateMenuMismatchOrThrow(
  findMenuList: MenuValidationFields[],
  menuPublicIds: string[]
): void {
  const extractedIds = new Set(findMenuList.map((m) => m.publicId));
  const missingIds = menuPublicIds.filter((id) => !extractedIds.has(id));

  if (missingIds.length === 0) return;

  throw new HttpException(
    {
      ...exceptionContentsIs("MENU_MISMATCH"),
      details: { missingMenuIds: missingIds },
    },
    HttpStatus.BAD_REQUEST
  );
}
