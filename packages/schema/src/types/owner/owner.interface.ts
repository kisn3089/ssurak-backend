import type { Admin } from "../admin/admin.interface";

/**
 * 매장 사장님 응답.
 * 서버는 `id`와 자격 증명(`password`·`refreshToken`)을 제외하고 내려준다.
 */
export interface Owner {
  publicId: string;
  email: string;
  name: string;
  phone: string;
  businessNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 로그인 주체 응답. 사장님 또는 관리자. */
export type User = Owner | Admin;
