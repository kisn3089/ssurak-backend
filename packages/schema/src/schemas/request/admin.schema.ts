import z from "zod";
import { commonSchema } from "./common.schema";
import { AdminRole } from "../../types/admin/admin.interface";

export const createAdminPayloadSchema = z
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
    role: z.nativeEnum(AdminRole),
  })
  .strict();

export const updateAdminPayloadSchema = createAdminPayloadSchema
  .omit({
    email: true,
    password: true,
  })
  .partial();

export const adminIdParamsSchema = z
  .object({ adminId: commonSchema.cuid2("Admin") })
  .strict();
