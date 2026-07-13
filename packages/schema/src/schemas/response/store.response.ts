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
  businessHours: z.string().nullable().describe("영업 시간"),
  description: z.string().nullable().describe("매장 설명"),
  isOpen: z.boolean().describe("영업 중 여부"),
  acceptedMessage: z.string().nullable().describe("주문 접수 메시지"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
}) satisfies z.ZodType<Store, z.ZodTypeDef, unknown>;
