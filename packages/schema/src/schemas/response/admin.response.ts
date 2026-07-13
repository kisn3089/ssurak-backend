import z from "zod";
import { AdminRole, type Admin } from "../../types/admin/admin.interface";
import { isoDateTime } from "./common.response";

/**
 * 관리자 응답.
 * `id`·`password`·`refreshToken`은 스키마에 없으므로 parse 시 제거된다.
 */
export const publicAdminSchema = z.object({
  publicId: z.string().describe("관리자 고유 ID"),
  email: z.string().describe("관리자 이메일"),
  name: z.string().describe("관리자 이름"),
  role: z.nativeEnum(AdminRole).describe("관리자 권한"),
  isActive: z.boolean().describe("활성화 여부"),
  lastLoginAt: isoDateTime().nullable().describe("마지막 로그인 시각"),
  createdAt: isoDateTime().describe("생성 시각"),
  updatedAt: isoDateTime().describe("수정 시각"),
}) satisfies z.ZodType<Admin, z.ZodTypeDef, unknown>;
