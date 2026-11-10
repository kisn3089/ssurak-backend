import { PrismaClient } from "@ssurak/db";

/**
 * e2e가 만든 계정 id 레지스트리.
 * 시드 헬퍼가 계정을 만들자마자 등록하고, setup 파일(test/setup/e2e-cleanup.ts)의
 * afterAll이 파일 종료 시 남은 것을 전부 지운다. 시드가 중간에 실패해 spec이
 * 반환값을 못 받았거나(afterAll에서 cleanup 호출 불가) Promise.all 중 하나만
 * 실패한 경우에도 이미 만들어진 행이 DB에 남지 않게 하는 안전망이다.
 */
const createdOwnerIds = new Set<bigint>();
const createdAdminIds = new Set<bigint>();

export function trackOwner(ownerId: bigint): void {
  createdOwnerIds.add(ownerId);
}

export function trackAdmin(adminId: bigint): void {
  createdAdminIds.add(adminId);
}

/**
 * 점주와 그 매장에 딸린 데이터를 FK 역순으로 지운다.
 * 전부 deleteMany라 이미 지워졌거나 일부만 생성된 상태여도 실패하지 않는다.
 */
export async function purgeOwner(
  prisma: PrismaClient,
  ownerId: bigint
): Promise<void> {
  const store = { ownerId };
  // 영업시간·휴무일과 옵션 그룹/선택지는 onDelete: Cascade로 함께 지워진다.
  await prisma.orderItem.deleteMany({ where: { order: { store } } });
  await prisma.order.deleteMany({ where: { store } });
  await prisma.tableSession.deleteMany({ where: { table: { store } } });
  await prisma.menu.deleteMany({ where: { category: { store } } });
  await prisma.category.deleteMany({ where: { store } });
  await prisma.table.deleteMany({ where: { store } });
  await prisma.store.deleteMany({ where: store });
  await prisma.authSession.deleteMany({
    where: { role: "owner", userId: ownerId },
  });
  await prisma.owner.deleteMany({ where: { id: ownerId } });
  createdOwnerIds.delete(ownerId);
}

export async function purgeAdmin(
  prisma: PrismaClient,
  adminId: bigint
): Promise<void> {
  await prisma.authSession.deleteMany({
    where: { role: "admin", userId: adminId },
  });
  await prisma.admin.deleteMany({ where: { id: adminId } });
  createdAdminIds.delete(adminId);
}

/** 등록된 계정 중 아직 지워지지 않은 것을 모두 정리한다. */
export async function purgeTracked(): Promise<void> {
  if (createdOwnerIds.size === 0 && createdAdminIds.size === 0) return;

  // spec의 afterAll이 app.close()로 PrismaService 연결을 이미 끊었을 수 있어 별도 클라이언트를 쓴다.
  const prisma = new PrismaClient();
  try {
    for (const ownerId of [...createdOwnerIds]) {
      await purgeOwner(prisma, ownerId);
    }
    for (const adminId of [...createdAdminIds]) {
      await purgeAdmin(prisma, adminId);
    }
  } finally {
    await prisma.$disconnect();
  }
}
