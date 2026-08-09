import { INestApplication } from "@nestjs/common";
import { OptionChoiceState } from "@ssurak/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CategoryService } from "src/stores/menu/category.service";
import { MenuOptionService } from "src/stores/menu/menu-option.service";
import { SessionService } from "src/stores/session/session.service";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import {
  cleanupStoreDomain,
  createSession,
  seedStoreDomain,
  SeededStoreDomain,
} from "test/helpers/seed-store";

/**
 * 점주 콘솔과 고객 메뉴판은 같은 옵션을 서로 다르게 봐야 한다.
 *
 * 점주는 옵션 API로 따로 조회하며 숨김·비활성 항목까지 전부 봐야 하고,
 * 고객 메뉴판은 그것들이 빠진 채로 한 번에 내려받는다. 두 경로가 같은 include 상수를
 * 공유하면 점주가 숨김 선택지를 못 보게 되고, 응답을 그대로 되돌려 보내 저장하는 순간
 * 그 선택지가 조용히 삭제된다. 그 회귀를 막는 것이 이 스펙의 목적이다.
 */
describe("메뉴 옵션 읽기 경로 (통합)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryService: CategoryService;
  let menuOptionService: MenuOptionService;
  let sessionService: SessionService;
  let domain: SeededStoreDomain;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    categoryService = app.get(CategoryService);
    menuOptionService = app.get(MenuOptionService);
    sessionService = app.get(SessionService);
    domain = await seedStoreDomain(prisma);

    // 소스 그룹을 비활성화해 "고객에게 안 보이는 그룹"을 만든다.
    await prisma.menuOptionGroup.updateMany({
      where: { menuId: domain.menuWithAdvancedOptions.id, name: "소스" },
      data: { enabled: false },
    });
  });

  afterAll(async () => {
    await cleanupStoreDomain(prisma, domain);
    await app.close();
  });

  /** 점주·고객 응답의 메뉴 타입이 다르므로 제네릭으로 각자의 타입을 그대로 살린다. */
  const toppingMenuOf = <MenuShape extends { name: string }>(
    categories: { menus: MenuShape[] }[]
  ): MenuShape =>
    categories
      .flatMap((category) => category.menus)
      .find((menu) => menu.name === "토핑 아이스크림")!;

  const ownerMenu = async () =>
    toppingMenuOf(
      await categoryService.getCategoryWithMenuList(
        domain.owner,
        domain.store.publicId
      )
    );

  const ownerOptions = async () =>
    await menuOptionService.getOptionList(
      domain.owner,
      domain.store.publicId,
      domain.menuWithAdvancedOptions.publicId
    );

  const customerMenu = async () => {
    const session = await createSession(prisma, domain.table);
    const context = await sessionService.getStoreContext(session.sessionToken);

    return toppingMenuOf(context.table.store.categories);
  };

  it("점주 메뉴 응답에는 옵션이 실리지 않는다 (옵션 API로 따로 조회한다)", async () => {
    expect(await ownerMenu()).not.toHaveProperty("options");
  });

  it("점주는 숨김 선택지와 비활성 그룹까지 모두 본다", async () => {
    const options = await ownerOptions();

    expect(options.map((group) => group.name)).toEqual(["토핑", "소스"]);
    const [topping] = options;
    expect(topping.choices.map((choice) => choice.name)).toEqual([
      "초코칩",
      "쿠키",
      "비공개 토핑",
      "그래놀라",
    ]);
  });

  it("고객에게는 비활성 그룹과 HIDDEN 선택지가 나가지 않는다", async () => {
    const menu = await customerMenu();

    expect(menu.options.map((group) => group.name)).toEqual(["토핑"]);
    const [topping] = menu.options;
    expect(topping.choices.map((choice) => choice.name)).not.toContain(
      "비공개 토핑"
    );
  });

  it("품절 선택지는 고객에게도 보인다 (품절 표시가 필요하다)", async () => {
    const [topping] = (await customerMenu()).options;
    const cookie = topping.choices.find((choice) => choice.name === "쿠키");

    expect(cookie?.state).toBe(OptionChoiceState.SOLD_OUT);
  });

  it("옵션과 선택지는 sortOrder 오름차순으로 내려간다", async () => {
    const options = await ownerOptions();

    expect(options.map((group) => group.sortOrder)).toEqual([10, 20]);
    expect(options[0].choices.map((choice) => choice.sortOrder)).toEqual([
      10, 20, 30, 40,
    ]);
  });

  it("메뉴를 하드 삭제하면 옵션 그룹·선택지가 함께 지워진다 (cascade)", async () => {
    // cleanupStoreDomain이 메뉴를 하드 삭제하므로 cascade가 빠지면 정리 단계에서야 터진다.
    const menu = await prisma.menu.create({
      data: {
        categoryId: domain.category.id,
        name: `cascade-${Date.now()}`,
        price: 1000,
        options: {
          create: [
            {
              name: "임시 옵션",
              choices: { create: [{ name: "임시 선택지" }] },
            },
          ],
        },
      },
      include: { options: { include: { choices: true } } },
    });
    const [group] = menu.options;

    await prisma.menu.delete({ where: { id: menu.id } });

    expect(
      await prisma.menuOptionGroup.count({ where: { menuId: menu.id } })
    ).toBe(0);
    expect(
      await prisma.menuOptionChoice.count({
        where: { optionGroupId: group.id },
      })
    ).toBe(0);
  });
});
