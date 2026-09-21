import z from "zod";
import type { Store } from "../../types/store/store.interface";
import { isoDateTime } from "./common.response";

/** 매장 응답. `id`·`ownerId`는 스키마에 없으므로 parse 시 제거된다. */
export const publicStoreSchema = z.object({
  publicId: z.string().describe("매장 고유 ID"),
  name: z.string().describe("매장명"),
  phone: z.string().nullable().describe("매장 전화번호"),
  address: z.string().describe("매장 주소"),
  addressDetail: z.string().nullable().describe("매장 상세 주소"),
  description: z.string().nullable().describe("매장 설명"),
  isPaused: z
    .boolean()
    .describe(
      "점주의 일시 중지 스위치. 실제 주문 가능 여부는 openState.isOpen으로 판단"
    ),
  acceptedMessage: z.string().nullable().describe("주문 접수 메시지"),
  timezone: z.string().describe("영업시간 판정 기준 타임존"),
  businessDayCutoff: z
    .number()
    .int()
    .describe("영업일 경계 (자정 기준 분). 기본 300 = 새벽 5시"),
  orderNumberPrefix: z.string().describe("주문번호 접두사"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
}) satisfies z.ZodType<Store, z.ZodTypeDef, unknown>;
