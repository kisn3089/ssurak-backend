import { AdminRole } from "@prisma/client";

export type AdminSeed = {
  email: string;
  name: string;
  role: AdminRole;
};

// 비밀번호는 공통값(qwer1234!)을 seed.ts에서 해싱해 주입한다.
export const adminSeeds: AdminSeed[] = [
  { email: "super@test.com", name: "super", role: AdminRole.SUPER },
  { email: "support@test.com", name: "support", role: AdminRole.SUPPORT },
  { email: "viewer@test.com", name: "viewer", role: AdminRole.VIEWER },
];
