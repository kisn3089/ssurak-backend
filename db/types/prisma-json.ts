// prisma-json-types-generator 가 Json 컬럼을 PrismaJson.* 로 타이핑하도록 전역 네임스페이스를 선언한다.
// schema.prisma 의 `/// [TypeName]` 어노테이션이 여기의 PrismaJson.TypeName 으로 매핑된다.
// 생성기가 요구하는 declaration merging 패턴이라 namespace 사용이 불가피하다.
/* eslint-disable @typescript-eslint/no-namespace */
import type {
  MenuCustomOption as _MenuCustomOption,
  MenuRequiredOption as _MenuRequiredOption,
  OrderItemOptionSnapshot as _OrderItemOptionSnapshot,
} from "./menuOptions.type";

declare global {
  namespace PrismaJson {
    type MenuRequiredOption = _MenuRequiredOption;
    type MenuCustomOption = _MenuCustomOption;
    type OrderItemOptionSnapshot = _OrderItemOptionSnapshot;
  }
}

export {};
