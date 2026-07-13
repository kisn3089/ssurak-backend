/**
 * 관리자 권한.
 * zod 스키마 등 런타임 값으로도 쓰이므로 const 객체로 선언한다.
 */
export const AdminRole = {
  /** 모든 권한을 소유한 관리자 */
  SUPER: "SUPER",
  /** 일부 기능에 대한 write 권한을 소유한 관리자 */
  SUPPORT: "SUPPORT",
  /** readonly 권한만 소유한 관리자 */
  VIEWER: "VIEWER",
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

/**
 * 관리자 응답.
 * 서버는 `id`와 자격 증명(`password`·`refreshToken`)을 제외하고 내려준다.
 */
export interface Admin {
  publicId: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
