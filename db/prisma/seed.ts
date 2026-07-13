import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { adminSeeds } from "./data/admins";
import { demoOwnerSeed, testOwnerSeed } from "./data/owners";
import { demoStoreSeed, testStoreSeed } from "./data/stores";
import { categorySeeds } from "./data/categories";
import { menuSeeds } from "./data/menus";
import { demoTableSeeds, testTableSeeds } from "./data/tables";
import { tableSessionSeeds } from "./data/sessions";
import { orderSeeds, orderItemSeeds } from "./data/orders";

const prisma = new PrismaClient();

// 관리자/점주 공통 비밀번호
const COMMON_PASSWORD = "qwer1234!";

async function encryptPassword(value: string): Promise<string> {
  return await bcrypt.hash(value, 10);
}

async function main() {
  console.log("🌱 Starting database seeding...");
  // ==================== Admin 데이터 ====================
  console.log("📝 Creating admins...");
  const adminPassword = await encryptPassword(COMMON_PASSWORD);
  for (const admin of adminSeeds) {
    await prisma.admin.upsert({
      where: { email: admin.email },
      update: {}, // 이미 있으면 변경하지 않음
      create: {
        email: admin.email,
        password: adminPassword,
        name: admin.name,
        role: admin.role,
        isActive: true,
      },
    });
  }
  console.log(
    "✅ Admins created:",
    adminSeeds.map((a) => a.email)
  );

  // ==================== Owner 데이터 ====================
  console.log("📝 Creating owners...");
  const demoOwner = await prisma.owner.upsert({
    where: { email: demoOwnerSeed.email },
    update: {},
    create: {
      email: demoOwnerSeed.email,
      password: await encryptPassword(demoOwnerSeed.password),
      name: demoOwnerSeed.name,
      phone: demoOwnerSeed.phone,
      businessNumber: demoOwnerSeed.businessNumber,
    },
  });
  const ownerTest = await prisma.owner.upsert({
    where: { email: testOwnerSeed.email },
    update: {},
    create: {
      email: testOwnerSeed.email,
      password: await encryptPassword(testOwnerSeed.password),
      name: testOwnerSeed.name,
      phone: testOwnerSeed.phone,
      businessNumber: testOwnerSeed.businessNumber,
    },
  });
  console.log("✅ Owners created:", {
    demoOwner: demoOwner.email,
    ownerTest: ownerTest.email,
  });

  // ==================== Store 데이터 ====================
  console.log("📝 Creating stores...");
  const demoStore = await prisma.store.upsert({
    where: { publicId: demoStoreSeed.publicId },
    update: {},
    create: { ...demoStoreSeed, ownerId: demoOwner.id },
  });
  const testStore = await prisma.store.upsert({
    where: { publicId: testStoreSeed.publicId },
    update: {},
    create: { ...testStoreSeed, ownerId: ownerTest.id },
  });
  console.log("✅ Stores created:", {
    demoStore: demoStore.name,
    testStore: testStore.name,
  });

  // ==================== Category 데이터 ====================
  console.log("📝 Creating categories...");
  for (const store of [demoStore, testStore]) {
    for (const def of categorySeeds) {
      await prisma.category.upsert({
        where: { storeId_name: { storeId: store.id, name: def.name } },
        update: { sortOrder: def.sortOrder },
        create: {
          storeId: store.id,
          name: def.name,
          sortOrder: def.sortOrder,
        },
      });
    }
  }
  console.log("✅ Categories created");

  // ==================== Menu 데이터 ====================
  console.log("📝 Creating menus...");
  // 카테고리를 매장별로 조회해 이름→id 맵 구성
  const categoryMapByStore = new Map<bigint, Map<string, bigint>>();
  for (const store of [demoStore, testStore]) {
    const cats = await prisma.category.findMany({
      where: { storeId: store.id },
    });
    categoryMapByStore.set(store.id, new Map(cats.map((c) => [c.name, c.id])));
  }

  const [demoMenus, testMenus] = [demoStore, testStore].map((store, index) =>
    menuSeeds.map(({ category, ...rest }) => ({
      ...rest,
      publicId: `${rest.publicId}${index}`,
      categoryId: categoryMapByStore.get(store.id)!.get(category)!,
    }))
  );
  await prisma.menu.createMany({
    data: [...demoMenus, ...testMenus],
    skipDuplicates: true, // 중복 무시
  });
  console.log("✅ Menus created");

  // ==================== Table 데이터 ====================
  console.log("📝 Creating tables...");
  // demoStore / testStore는 서로 다른 더미 값의 테이블을 갖는다.
  await prisma.table.createMany({
    data: demoTableSeeds.map((t) => ({ ...t, storeId: demoStore.id })),
    skipDuplicates: true,
  });
  await prisma.table.createMany({
    data: testTableSeeds.map((t) => ({ ...t, storeId: testStore.id })),
    skipDuplicates: true,
  });
  console.log("✅ Tables created");

  // session·order 시나리오는 testStore(owner@test.com)에만 적용한다.
  // testStore 테이블/메뉴를 자연키(테이블 번호·메뉴명)로 조회할 수 있게 맵 구성
  const testTables = await prisma.table.findMany({
    where: { storeId: testStore.id },
  });
  const tableByNumber = new Map(testTables.map((t) => [t.tableNumber, t]));

  const createdTestMenus = await prisma.menu.findMany({
    where: { category: { storeId: testStore.id } },
  });
  const menuByName = new Map(createdTestMenus.map((m) => [m.name, m]));

  // ==================== TableSession 데이터 ====================
  console.log("📝 Creating table sessions...");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2시간 후

  const sessionByPublicId = new Map<string, { id: bigint }>();
  for (const session of tableSessionSeeds) {
    const table = tableByNumber.get(session.tableNumber)!;
    const created = await prisma.tableSession.upsert({
      where: { publicId: session.publicId },
      update: {},
      create: {
        publicId: session.publicId,
        tableId: table.id,
        status: session.status,
        sessionToken: session.sessionToken,
        activatedAt: now,
        expiresAt,
        paidAmount: 0,
      },
    });
    sessionByPublicId.set(session.publicId, created);
  }
  console.log("✅ Table sessions created");

  // ==================== Order 데이터 ====================
  console.log("📝 Creating orders...");
  const offsetToDate = (offsetMin?: number) =>
    offsetMin != null
      ? new Date(now.getTime() - offsetMin * 60 * 1000)
      : undefined;

  const orderByPublicId = new Map<string, { id: bigint }>();
  for (const order of orderSeeds) {
    const table = tableByNumber.get(order.tableNumber)!;
    const session = sessionByPublicId.get(order.sessionPublicId)!;
    const created = await prisma.order.upsert({
      where: { publicId: order.publicId },
      update: {},
      create: {
        publicId: order.publicId,
        storeId: testStore.id,
        tableId: table.id,
        tableSessionId: session.id,
        status: order.status,
        memo: order.memo ?? null,
        cancelledReason: order.cancelledReason,
        acceptedAt: offsetToDate(order.acceptedOffsetMin),
        completedAt: offsetToDate(order.completedOffsetMin),
      },
    });
    orderByPublicId.set(order.publicId, created);
  }

  // ==================== OrderItem 데이터 ====================
  console.log("📝 Creating order items...");
  await prisma.orderItem.createMany({
    data: orderItemSeeds.map((item) => {
      const order = orderByPublicId.get(item.orderPublicId)!;
      const menu = menuByName.get(item.menuName)!;
      return {
        publicId: item.publicId,
        orderId: order.id,
        menuImageUrl: menu.imageUrl,
        menuId: menu.id,
        menuName: item.menuName,
        basePrice: item.basePrice,
        optionsPrice: item.optionsPrice,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        optionsSnapshot: item.optionsSnapshot,
      };
    }),
    skipDuplicates: true,
  });
  console.log("✅ Orders and order items created");

  console.log("\n🎉 Seeding completed successfully!");
  console.log("\n📋 Test Accounts:");
  console.log("┌─────────────────────────────────────────────────────┐");
  console.log("│ Admin Accounts                                       │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log("│ Super Admin: super@test.com / qwer1234!       │");
  console.log("│ Support:     support@test.com / qwer1234!     │");
  console.log("│ Viewer:      viewer@test.com / qwer1234!      │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log("│ Owner Accounts                                       │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log("│ Demo:      demo@ssurak.com / demo1234!         │");
  console.log("│ OwnerTest: owner@test.com / qwer1234!          │");
  console.log("└─────────────────────────────────────────────────────┘");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:");
    console.error(e);
    // compose가 service_completed_successfully 로 이 프로세스를 게이트로 쓰므로
    // 실패를 exit code로 반드시 드러내야 한다.
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
