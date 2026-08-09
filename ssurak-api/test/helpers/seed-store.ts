import { createId } from "@paralleldrive/cuid2";
import {
  Category,
  Menu,
  OptionChoiceState,
  OptionSelectionType,
  Owner,
  Prisma,
  SessionWithTable,
  Store,
  Table,
  TableSessionStatus,
} from "@ssurak/db";
import type { MenuOptionSelection } from "@ssurak/schema";
import { PrismaService } from "src/prisma/prisma.service";
import { encrypt, generateSecureSessionToken } from "src/utils/lib/crypt";

/** 테스트가 옵션·선택지 publicId를 읽어야 하므로 관계를 함께 들고 다닌다. */
export type MenuWithOptions = Prisma.MenuGetPayload<{
  include: { options: { include: { choices: true } } };
}>;

const MENU_WITH_OPTIONS_INCLUDE = {
  options: { include: { choices: true }, orderBy: { sortOrder: "asc" } },
} as const satisfies Prisma.MenuInclude;

export type SeededStoreDomain = {
  owner: Owner;
  store: Store;
  table: Table;
  category: Category;
  /** 필수옵션(사이즈: 톨0/라지500) + 선택옵션(샷: 기본0/샷추가500) */
  menuWithOptions: MenuWithOptions;
  /**
   * 새 옵션 축을 모두 담은 메뉴(2000원).
   * 토핑: MULTIPLE 0~2, 수량 가능한 선택지 + 품절 + 숨김 / 소스: 토핑 선택 시에만 노출
   */
  menuWithAdvancedOptions: MenuWithOptions;
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
      options: {
        create: [
          {
            name: "사이즈",
            selectionType: OptionSelectionType.SINGLE,
            required: true,
            minSelect: 1,
            sortOrder: 10,
            choices: {
              create: [
                { name: "톨", priceDelta: 0, isDefault: true, sortOrder: 10 },
                { name: "라지", priceDelta: 500, sortOrder: 20 },
              ],
            },
          },
          {
            name: "샷",
            selectionType: OptionSelectionType.SINGLE,
            sortOrder: 20,
            choices: {
              create: [
                { name: "기본", priceDelta: 0, isDefault: true, sortOrder: 10 },
                { name: "샷추가", priceDelta: 500, sortOrder: 20 },
              ],
            },
          },
        ],
      },
    },
    include: MENU_WITH_OPTIONS_INCLUDE,
  });

  const menuWithAdvancedOptions = await prisma.menu.create({
    data: {
      categoryId: category.id,
      name: "토핑 아이스크림",
      price: 2000,
      options: {
        create: [
          {
            name: "토핑",
            selectionType: OptionSelectionType.MULTIPLE,
            maxSelect: 2,
            sortOrder: 10,
            choices: {
              create: [
                {
                  name: "초코칩",
                  priceDelta: 300,
                  quantityEnabled: true,
                  maxQuantity: 3,
                  sortOrder: 10,
                },
                {
                  name: "쿠키",
                  priceDelta: 500,
                  state: OptionChoiceState.SOLD_OUT,
                  sortOrder: 20,
                },
                {
                  name: "비공개 토핑",
                  priceDelta: 100,
                  state: OptionChoiceState.HIDDEN,
                  sortOrder: 30,
                },
                { name: "그래놀라", priceDelta: 0, sortOrder: 40 },
              ],
            },
          },
        ],
      },
    },
    include: MENU_WITH_OPTIONS_INCLUDE,
  });

  // 트리거는 앞선 그룹의 실제 publicId를 참조해야 하므로 그룹 생성 뒤에 붙인다.
  const [toppingGroup] = menuWithAdvancedOptions.options;
  const granola = toppingGroup.choices.find(({ name }) => name === "그래놀라")!;

  await prisma.menuOptionGroup.create({
    data: {
      menuId: menuWithAdvancedOptions.id,
      name: "소스",
      selectionType: OptionSelectionType.SINGLE,
      sortOrder: 20,
      trigger: [
        { optionId: toppingGroup.publicId, choiceIds: [granola.publicId] },
      ],
      choices: {
        create: [
          { name: "초코 소스", priceDelta: 200, sortOrder: 10 },
          { name: "딸기 소스", priceDelta: 200, sortOrder: 20 },
        ],
      },
    },
  });

  const simpleMenu = await prisma.menu.create({
    data: { categoryId: category.id, name: "생수", price: 1000 },
  });

  return {
    owner,
    store,
    table,
    category,
    menuWithOptions,
    menuWithAdvancedOptions: await prisma.menu.findUniqueOrThrow({
      where: { id: menuWithAdvancedOptions.id },
      include: MENU_WITH_OPTIONS_INCLUDE,
    }),
    simpleMenu,
  };
}

/**
 * 옵션 publicId는 서버가 발급하므로 테스트가 이름으로 되짚어 선택 페이로드를 만든다.
 * 수량을 지정하려면 `["에스프레소 샷", 3]` 형태로 넘긴다.
 */
export function selectOption(
  menu: MenuWithOptions,
  groupName: string,
  ...choices: (string | [string, number])[]
): MenuOptionSelection {
  const group = menu.options.find(({ name }) => name === groupName);
  if (!group) throw new Error(`옵션 그룹을 찾을 수 없습니다: ${groupName}`);

  return {
    optionId: group.publicId,
    choices: choices.map((entry) => {
      const [choiceName, quantity] = Array.isArray(entry) ? entry : [entry, 1];
      const choice = group.choices.find(({ name }) => name === choiceName);
      if (!choice) throw new Error(`선택지를 찾을 수 없습니다: ${choiceName}`);

      return { choiceId: choice.publicId, quantity };
    }),
  };
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
