import z from "zod";
import { commonSchema } from "./common.schema";

export const storeIdParamsSchema = z
  .object({
    storeId: commonSchema.cuid2("Store"),
  })
  .strict();

export type CreateStorePayload = z.infer<typeof createStorePayloadSchema>;

/**
 * 매장 소유자는 토큰에서 정하므로 `ownerId`는 받지 않는다.
 * nullable 필드는 null을 명시하면 값을 비우는 의미다(수정 시 기존 값 삭제).
 */
export const createStorePayloadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "매장 이름은 필수입니다.")
      .max(30, "매장 이름은 최대 30자까지 가능합니다."),
    address: z
      .string()
      .trim()
      .min(1, "매장 주소는 필수입니다.")
      .max(100, "매장 주소는 최대 100자까지 가능합니다."),
    addressDetail: z
      .string()
      .trim()
      .max(100, "상세 주소는 최대 100자까지 가능합니다.")
      .nullable()
      .optional(),
    // 매장 번호는 유선(02-123-4567)·휴대폰(010-1234-5678)에 더해
    // 050X 안심번호(0507-1234-5678)까지 허용한다 — 배달앱이 발급하는 번호를 그대로 등록한다.
    phone: z
      .string()
      .trim()
      .regex(
        /^0(?:50[0-9]|[0-9]{1,2})-?[0-9]{3,4}-?[0-9]{4}$/,
        "올바른 매장 전화번호 형식을 입력해주세요."
      )
      .nullable()
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "매장 설명은 최대 500자까지 가능합니다.")
      .nullable()
      .optional(),
    isPaused: z.boolean().optional(),
    // DB가 VarChar(500)이므로 그 이상은 받지 않는다.
    acceptedMessage: z
      .string()
      .trim()
      .max(500, "주문 접수 메시지는 최대 500자까지 가능합니다.")
      .nullable()
      .optional(),
    // IANA 타임존 이름. 형식만 보고 실재 여부는 서비스에서 Intl로 검증한다.
    timezone: z
      .string()
      .trim()
      .max(40, "타임존은 최대 40자까지 가능합니다.")
      .regex(
        /^[A-Za-z_]+(?:\/[A-Za-z_+-][A-Za-z0-9_+-]*)*$/,
        "올바른 타임존 이름을 입력해 주세요. (예: Asia/Seoul)"
      )
      .optional(),
    /**
     * 영업일 경계(자정 기준 분). 어제 마감과 오늘 오픈 사이의 빈 구간이어야 하므로
     * 하루의 절반을 넘지 않도록 상한을 둔다.
     */
    businessDayCutoff: z
      .number()
      .int("영업일 경계는 1분 단위 정수로 입력해 주세요.")
      .min(0, "영업일 경계는 0분 이상이어야 합니다.")
      .max(720, "영업일 경계는 정오(720분)를 넘을 수 없습니다.")
      .optional(),
    orderNumberPrefix: z
      .string()
      .trim()
      .min(1, "주문번호 접두사는 필수입니다.")
      .max(4, "주문번호 접두사는 최대 4자까지 가능합니다.")
      .regex(
        /^[A-Za-z0-9]+$/,
        "주문번호 접두사는 영문·숫자만 사용할 수 있습니다."
      )
      .optional(),
  })
  .strict();

export type UpdateStorePayload = z.infer<typeof updateStorePayloadSchema>;

export const updateStorePayloadSchema = createStorePayloadSchema.partial();
