import z from "zod";
import {
  DAY_OF_WEEK_MAX,
  DAY_OF_WEEK_MIN,
  MINUTES_PER_DAY,
} from "../../types/businessHour/businessHour.interface";
import { commonSchema } from "./common.schema";
import { storeIdParamsSchema } from "./store.schema";

const closureIdParamsSchema = z
  .object({ closureId: commonSchema.cuid2("StoreClosure") })
  .strict();

export const storeIdAndClosureIdParamsSchema = storeIdParamsSchema.merge(
  closureIdParamsSchema
);

/**
 * 자정 기준 분. 자정을 넘기는 영업(마감 26:00 = 1560)을 표현해야 하므로
 * 상한을 하루의 두 배로 둔다. 매장별 businessDayCutoff에 따른 실제 상한은
 * body만으로 알 수 없어 서비스에서 교차 검증한다.
 */
const minuteOfDay = z
  .number({
    required_error: "시각은 필수입니다.",
    invalid_type_error: "시각은 자정 기준 분(정수)으로 입력해 주세요.",
  })
  .int("시각은 1분 단위 정수로 입력해 주세요.")
  .min(0, "시각은 0분 이상이어야 합니다.")
  .max(MINUTES_PER_DAY * 2, "시각은 48시간을 넘을 수 없습니다.");

/** "YYYY-MM-DD". 달력상 실재하는 날짜인지까지 검사한다. */
const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식으로 입력해 주세요.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "존재하지 않는 날짜입니다.");

const businessHourDaySchema = z
  .object({
    dayOfWeek: z
      .number({ required_error: "요일은 필수입니다." })
      .int()
      .min(DAY_OF_WEEK_MIN, "요일은 0(일)~6(토) 사이여야 합니다.")
      .max(DAY_OF_WEEK_MAX, "요일은 0(일)~6(토) 사이여야 합니다."),
    isClosed: z.boolean().default(false),
    openMinute: minuteOfDay,
    closeMinute: minuteOfDay,
    breakStartMinute: minuteOfDay.nullable().optional(),
    breakEndMinute: minuteOfDay.nullable().optional(),
  })
  .strict()
  .superRefine((day, ctx) => {
    // 정기 휴무 요일은 시간 값을 보지 않는다 — 휴무를 해제했을 때 되살릴 값으로 남겨둔다.
    if (day.isClosed) return;

    if (day.openMinute >= day.closeMinute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closeMinute"],
        message: "마감 시각은 오픈 시각보다 뒤여야 합니다.",
      });
    }

    const { breakStartMinute, breakEndMinute } = day;
    const hasBreakStart =
      breakStartMinute !== null && breakStartMinute !== undefined;
    const hasBreakEnd = breakEndMinute !== null && breakEndMinute !== undefined;

    if (hasBreakStart !== hasBreakEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakStartMinute"],
        message: "브레이크타임은 시작과 종료를 함께 입력해야 합니다.",
      });
      return;
    }

    if (!hasBreakStart || !hasBreakEnd) return;

    const breakStart = breakStartMinute;
    const breakEnd = breakEndMinute;

    if (breakStart >= breakEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakEndMinute"],
        message: "브레이크타임 종료는 시작보다 뒤여야 합니다.",
      });
    }

    if (breakStart < day.openMinute || breakEnd > day.closeMinute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakStartMinute"],
        message: "브레이크타임은 영업 시간 안에 있어야 합니다.",
      });
    }
  });

export type BusinessHourDayPayload = z.infer<typeof businessHourDaySchema>;
export type ReplaceBusinessHoursPayload = z.infer<
  typeof replaceBusinessHoursPayloadSchema
>;

/**
 * 요일별 영업시간 전체 교체. 부분 수정이 아니라 전체 교체인 이유는
 * 점주 콘솔이 요일 7줄을 한 폼으로 저장하기 때문이다 — 보내지 않은 요일은 삭제된다.
 * 빈 배열을 보내면 "영업시간 미설정"(= 항상 영업) 상태로 되돌아간다.
 */
export const replaceBusinessHoursPayloadSchema = z
  .object({
    days: z
      .array(businessHourDaySchema)
      .max(7, "요일은 최대 7개까지 보낼 수 있습니다.")
      .superRefine((days, ctx) => {
        const seen = new Set<number>();
        for (const day of days) {
          if (seen.has(day.dayOfWeek)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "같은 요일을 두 번 보낼 수 없습니다.",
            });
            return;
          }
          seen.add(day.dayOfWeek);
        }
      }),
  })
  .strict();

export type CreateClosurePayload = z.infer<typeof createClosurePayloadSchema>;

/**
 * 임시 휴무일. openMinute·closeMinute을 함께 보내면 종일 휴무가 아니라
 * "그날만 이 시간으로 영업"이 된다(단축 영업·명절 특별 영업).
 */
export const createClosurePayloadSchema = z
  .object({
    date: businessDateSchema,
    reason: z
      .string()
      .trim()
      .max(100, "휴무 사유는 최대 100자까지 가능합니다.")
      .nullable()
      .optional(),
    openMinute: minuteOfDay.nullable().optional(),
    closeMinute: minuteOfDay.nullable().optional(),
  })
  .strict()
  .superRefine((closure, ctx) => {
    const { openMinute, closeMinute } = closure;
    const hasOpen = openMinute !== null && openMinute !== undefined;
    const hasClose = closeMinute !== null && closeMinute !== undefined;

    if (hasOpen !== hasClose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["openMinute"],
        message:
          "특별 영업시간은 오픈과 마감을 함께 입력해야 합니다. 종일 휴무는 둘 다 비워 주세요.",
      });
      return;
    }

    if (hasOpen && hasClose && openMinute >= closeMinute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closeMinute"],
        message: "마감 시각은 오픈 시각보다 뒤여야 합니다.",
      });
    }
  });

export type UpdateClosurePayload = z.infer<typeof updateClosurePayloadSchema>;

/** 날짜는 바꿀 수 없다 — 다른 날짜로 옮기려면 지우고 새로 만든다(unique 충돌 회피). */
export const updateClosurePayloadSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(100, "휴무 사유는 최대 100자까지 가능합니다.")
      .nullable()
      .optional(),
    openMinute: minuteOfDay.nullable().optional(),
    closeMinute: minuteOfDay.nullable().optional(),
  })
  .strict();

export type ClosureRangeQuery = z.infer<typeof closureRangeQuerySchema>;

/** 조회 구간. 생략하면 서비스가 오늘부터 90일을 기본값으로 쓴다. */
export const closureRangeQuerySchema = z
  .object({
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .strict()
  .superRefine((range, ctx) => {
    if (range.from && range.to && range.from > range.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "조회 종료일은 시작일보다 뒤여야 합니다.",
      });
    }
  });
