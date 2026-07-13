import { createZodDto } from "nestjs-zod";
import {
  boardTableSessionSchema,
  publicSessionWithTableSchema,
} from "@ssurak/schema";

/** 보드 세션 DTO (full 주문 포함) */
export class BoardTableSessionDto extends createZodDto(
  boardTableSessionSchema
) {}

/** 점주 세션 목록·상세 DTO (테이블 + 주문 포함) */
export class PublicSessionWithTableDto extends createZodDto(
  publicSessionWithTableSchema
) {}
