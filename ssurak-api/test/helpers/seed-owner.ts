import { createId } from "@paralleldrive/cuid2";
import type { Owner, Store } from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import { encrypt } from "src/utils/lib/crypt";

export type SeededOwner = {
  owner: Owner;
  stores: Store[];
  email: string;
  password: string;
};

/** 고유 이메일의 Owner와 매장 N개를 생성한다. 테스트 종료 시 cleanupOwner로 정리할 것. */
export async function seedOwnerWithStores(
  prisma: PrismaService,
  storeCount: number
): Promise<SeededOwner> {
  const suffix = createId();
  const email = `e2e-${suffix}@test.local`;
  const password = "e2e-password-1234!";

  const owner = await prisma.owner.create({
    data: {
      email,
      password: await encrypt(password),
      name: `e2e-owner-${suffix}`,
      phone: "010-0000-0000",
      isActive: true,
      stores: {
        create: Array.from({ length: storeCount }, (_, index) => ({
          name: `e2e-store-${suffix}-${index}`,
          address: "서울시 테스트구 테스트로 1",
        })),
      },
    },
    include: { stores: true },
  });

  const { stores, ...ownerOnly } = owner;
  return { owner: ownerOnly, stores, email, password };
}

export async function cleanupOwner(
  prisma: PrismaService,
  ownerId: bigint
): Promise<void> {
  await prisma.store.deleteMany({ where: { ownerId } });
  await prisma.authSession.deleteMany({
    where: { role: "owner", userId: ownerId },
  });
  await prisma.owner.delete({ where: { id: ownerId } });
}
