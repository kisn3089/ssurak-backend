import z from "zod";
import { commonSchema } from "./common.schema";

export const createOwnerPayloadSchema = z
  .object({
    email: z.string().email("유효한 이메일 주소를 입력해주세요."),
    password: z
      .string()
      .min(8, "비밀번호는 최소 8자 이상이어야 합니다.")
      .regex(/[a-z]/, "비밀번호는 최소 1개의 소문자를 포함해야 합니다.")
      .regex(/[0-9]/, "비밀번호는 최소 1개의 숫자를 포함해야 합니다.")
      .regex(
        /[^a-zA-Z0-9]/,
        "비밀번호는 최소 1개의 특수문자를 포함해야 합니다."
      ),
    name: z.string().min(1, "이름을 입력해주세요."),
    phone: z
      .string()
      .regex(
        /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/,
        "올바른 한국 전화번호 형식을 입력해주세요."
      ),
    // TODO: 사업자등록번호 형식 검증 추가
    businessNumber: z.string().min(8, "사업자등록번호를 입력해주세요."),
  })
  .strict();

export const updateOwnerPayloadSchema = createOwnerPayloadSchema
  .omit({
    email: true,
    password: true,
  })
  .partial();

export const ownerIdParamsSchema = z
  .object({ ownerId: commonSchema.cuid2("Owner") })
  .strict();
