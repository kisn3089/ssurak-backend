import { createId } from "@paralleldrive/cuid2";
import type { Admin } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import { encrypt } from "src/utils/lib/crypt";
import { purgeAdmin, trackAdmin } from "test/helpers/e2e-cleanup";

export type SeededAdmin = {
  admin: Admin;
  email: string;
  password: string;
};

/** 고유 이메일의 Admin을 생성한다. 테스트 종료 시 cleanupAdmin으로 정리할 것. */
export async function seedAdmin(prisma: PrismaService): Promise<SeededAdmin> {
  const suffix = createId();
  const email = `e2e-admin-${suffix}@test.local`;
  const password = "e2e-password-1234!";

  const admin = await prisma.admin.create({
    data: {
      email,
      password: await encrypt(password),
      name: `e2e-admin-${suffix}`,
      isActive: true,
    },
  });
  trackAdmin(admin.id);

  return { admin, email, password };
}

export async function cleanupAdmin(
  prisma: PrismaService,
  adminId: bigint
): Promise<void> {
  await purgeAdmin(prisma, adminId);
}
