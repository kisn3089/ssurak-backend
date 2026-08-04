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
    // TODO: 추후 holiday, breakTime로 변경하고 해당 필드들은 제거한다.
    businessHours: z
      .string()
      .trim()
      .max(100, "영업 시간은 최대 100자까지 가능합니다.")
      .nullable()
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, "매장 설명은 최대 500자까지 가능합니다.")
      .nullable()
      .optional(),
    isOpen: z.boolean().optional(),
    // DB가 VarChar(500)이므로 그 이상은 받지 않는다.
    acceptedMessage: z
      .string()
      .trim()
      .max(500, "주문 접수 메시지는 최대 500자까지 가능합니다.")
      .nullable()
      .optional(),
  })
  .strict();

export type UpdateStorePayload = z.infer<typeof updateStorePayloadSchema>;

export const updateStorePayloadSchema = createStorePayloadSchema.partial();
