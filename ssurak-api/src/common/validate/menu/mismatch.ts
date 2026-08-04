import { HttpException, HttpStatus } from "@nestjs/common";
import { exceptionContentsIs } from "../../constants/exceptionContents";
import { Prisma } from "@ssurak/db";
import { MENU_VALIDATION_FIELDS_SELECT } from "src/common/query/menu-query.const";

/**
 * 검증 경로가 다루는 메뉴의 모양. 옵션이 관계가 된 뒤로는 Pick으로 표현할 수 없어
 * select 상수에서 직접 파생한다(둘이 어긋날 수 없다).
 */
export type MenuValidationFields = Prisma.MenuGetPayload<{
  select: typeof MENU_VALIDATION_FIELDS_SELECT;
}>;

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
