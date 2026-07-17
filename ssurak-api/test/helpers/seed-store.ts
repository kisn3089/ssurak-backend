import { createId } from "@paralleldrive/cuid2";
import {
  Category,
  Menu,
  Owner,
  Prisma,
  SessionWithTable,
  Store,
  Table,
  TableSessionStatus,
} from "@ssurak/db";
import { PrismaService } from "src/prisma/prisma.service";
import { encrypt, generateSecureSessionToken } from "src/utils/lib/crypt";

export type SeededStoreDomain = {
  owner: Owner;
  store: Store;
  table: Table;
  category: Category;
  /** 필수옵션(사이즈: 톨0/라지500) + 선택옵션(샷: 기본0/샷추가500) */
  menuWithOptions: Menu;
  /** 옵션 없는 메뉴 (1000원) */
  simpleMenu: Menu;
};

/** owner → store → table → category → menu 2종을 생성한다. */
export async function seedStoreDomain(
  prisma: PrismaService
): Promise<SeededStoreDomain> {
  const suffix = createId();

  const owner = await prisma.owner.create({
    data: {
      email: `e2e-${suffix}@test.local`,
      password: await encrypt("e2e-password-1234!"),
      name: `e2e-owner-${suffix}`,
      phone: "010-0000-0000",
      isActive: true,
    },
  });

  const store = await prisma.store.create({
    data: {
      ownerId: owner.id,
      name: `e2e-store-${suffix}`,
      address: "서울시 테스트구 테스트로 1",
    },
  });

  const table = await prisma.table.create({
    data: { storeId: store.id, tableNumber: "1" },
  });

  const category = await prisma.category.create({
    data: { storeId: store.id, name: `커피-${suffix}` },
  });

  const menuWithOptions = await prisma.menu.create({
    data: {
      categoryId: category.id,
      name: "아메리카노",
      price: 3000,
      requiredOptions: {
        사이즈: {
          options: [
            { key: "톨", price: 0 },
            { key: "라지", price: 500 },
          ],
          defaultKey: "톨",
        },
      },
      customOptions: {
        샷: {
          options: [
            { key: "기본", price: 0 },
            { key: "샷추가", price: 500 },
          ],
          defaultKey: "기본",
        },
      },
    },
  });

  const simpleMenu = await prisma.menu.create({
    data: { categoryId: category.id, name: "생수", price: 1000 },
  });

  return { owner, store, table, category, menuWithOptions, simpleMenu };
}

/** 서비스 시그니처(SessionWithTable)에 맞는 세션을 생성한다. */
export async function createSession(
  prisma: PrismaService,
  table: Table,
  overrides: Partial<Prisma.TableSessionUncheckedCreateInput> = {}
): Promise<SessionWithTable> {
  return await prisma.tableSession.create({
    data: {
      tableId: table.id,
      status: TableSessionStatus.ACTIVE,
      sessionToken: generateSecureSessionToken(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      ...overrides,
    },
    include: { table: { include: { store: { select: { publicId: true } } } } },
  });
}

export async function cleanupStoreDomain(
  prisma: PrismaService,
  domain: SeededStoreDomain
): Promise<void> {
  const storeId = domain.store.id;
  await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
  await prisma.order.deleteMany({ where: { storeId } });
  await prisma.tableSession.deleteMany({ where: { table: { storeId } } });
  await prisma.menu.deleteMany({ where: { category: { storeId } } });
  await prisma.category.deleteMany({ where: { storeId } });
  await prisma.table.deleteMany({ where: { storeId } });
  await prisma.store.delete({ where: { id: storeId } });
  await prisma.authSession.deleteMany({
    where: { role: "owner", userId: domain.owner.id },
  });
  await prisma.owner.delete({ where: { id: domain.owner.id } });
}
