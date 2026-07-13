import z from "zod";
import type { Owner } from "../../types/owner/owner.interface";
import { isoDateTime } from "./common.response";

/**
 * 매장 사장님 응답.
 * `id`·`password`·`refreshToken`은 스키마에 없으므로 parse 시 제거된다.
 */
export const publicOwnerSchema = z.object({
  publicId: z.string().describe("사용자 고유 ID"),
  email: z.string().describe("이메일"),
  name: z.string().describe("이름"),
  phone: z.string().describe("전화번호"),
  businessNumber: z.string().nullable().describe("사업자 번호"),
  isActive: z.boolean().describe("활성화 여부"),
  lastLoginAt: isoDateTime().nullable().describe("마지막 로그인 시간"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
}) satisfies z.ZodType<Owner, z.ZodTypeDef, unknown>;
