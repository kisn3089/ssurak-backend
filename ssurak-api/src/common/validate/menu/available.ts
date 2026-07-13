import { HttpException, HttpStatus } from "@nestjs/common";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { MenuValidationFields } from "./mismatch";

export function validateMenuAvailableOrThrow(menu: MenuValidationFields): void {
  if (!menu.isAvailable) {
    throw new HttpException(
      { ...exceptionContentsIs("MENU_NOT_AVAILABLE"), details: menu.name },
      HttpStatus.BAD_REQUEST
    );
  }
}
