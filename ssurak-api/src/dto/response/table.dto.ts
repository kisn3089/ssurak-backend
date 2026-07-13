import { createZodDto } from "nestjs-zod";
import {
  boardTableSchema,
  publicTableSchema,
  publicTableSessionSchema,
  publicTableWithRelationsSchema,
  tableWithStoreContextSchema,
} from "@ssurak/schema";

export class TableDto extends createZodDto(publicTableSchema) {}

export class PublicTableSessionDto extends createZodDto(
  publicTableSessionSchema
) {}

/** 테이블 + 선택적 관계(매장·주문·세션) 응답 DTO */
export class PublicTableDto extends createZodDto(
  publicTableWithRelationsSchema
) {}

/** 고객 메뉴판 진입 시 내려오는 매장 컨텍스트 DTO */
export class TableWithStoreContextDto extends createZodDto(
  tableWithStoreContextSchema
) {}

/** 보드 테이블 DTO (full 주문 세션 포함) */
export class BoardTableDto extends createZodDto(boardTableSchema) {}
