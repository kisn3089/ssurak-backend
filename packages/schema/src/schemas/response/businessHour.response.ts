import z from "zod";
import {
  StoreOpenReason,
  type StoreBusinessHour,
  type StoreClosure,
  type StoreOpenState,
} from "../../types/businessHour/businessHour.interface";
import { isoDateTime } from "./common.response";

/**
 * 요일별 정기 영업시간 응답.
 * `id`·`storeId`·타임스탬프는 스키마에 없으므로 parse 시 제거된다.
 */
export const publicBusinessHourSchema = z.object({
  dayOfWeek: z.number().int().describe("요일 (0=일 ~ 6=토)"),
  isClosed: z.boolean().describe("정기 휴무 요일 여부"),
  openMinute: z.number().int().describe("오픈 시각 (자정 기준 분)"),
  closeMinute: z
    .number()
    .int()
    .describe("마감 시각 (자정 기준 분. 자정을 넘기면 1440 초과)"),
  breakStartMinute: z
    .number()
    .int()
    .nullable()
    .describe("브레이크타임 시작 (자정 기준 분)"),
  breakEndMinute: z
    .number()
    .int()
    .nullable()
    .describe("브레이크타임 종료 (자정 기준 분)"),
}) satisfies z.ZodType<StoreBusinessHour, z.ZodTypeDef, unknown>;

/** 임시 휴무일·특별 영업시간 응답. */
export const publicClosureSchema = z.object({
  publicId: z.string().describe("휴무일 고유 ID"),
  date: z.string().describe("날짜 (YYYY-MM-DD)"),
  reason: z.string().nullable().describe("휴무 사유"),
  openMinute: z
    .number()
    .int()
    .nullable()
    .describe("특별 영업 오픈 시각. null이면 종일 휴무"),
  closeMinute: z
    .number()
    .int()
    .nullable()
    .describe("특별 영업 마감 시각. null이면 종일 휴무"),
}) satisfies z.ZodType<StoreClosure, z.ZodTypeDef, unknown>;

/** 매장이 지금 주문을 받을 수 있는지에 대한 판정 결과. */
export const storeOpenStateSchema = z.object({
  isOpen: z.boolean().describe("지금 주문을 받을 수 있는지"),
  reason: z.nativeEnum(StoreOpenReason).describe("판정 사유"),
  businessDate: z.string().describe("판정 시점이 속한 영업일 (YYYY-MM-DD)"),
  nextOpenAt: isoDateTime().nullable().describe("다음 영업 시작 시각"),
  closesAt: isoDateTime().nullable().describe("영업 중일 때의 마감 시각"),
}) satisfies z.ZodType<StoreOpenState, z.ZodTypeDef, unknown>;
