import { HttpStatus, INestApplication } from "@nestjs/common";
import { OptionChoiceState, OptionSelectionType } from "@ssurak/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreateMenuOptionPayload } from "@ssurak/schema";
import { MenuOptionChoiceService } from "src/stores/menu/menu-option-choice.service";
import { MenuOptionService } from "src/stores/menu/menu-option.service";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";
import {
  cleanupStoreDomain,
  seedStoreDomain,
  SeededStoreDomain,
} from "test/helpers/seed-store";

describe("MenuOptionService (통합)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: MenuOptionService;
  let choiceService: MenuOptionChoiceService;
  let domain: SeededStoreDomain;
  /** 케이스마다 새 메뉴를 만들어 옵션 조작이 서로 간섭하지 않게 한다. */
  let menuId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    service = app.get(MenuOptionService);
    choiceService = app.get(MenuOptionChoiceService);
    domain = await seedStoreDomain(prisma);
  });

  afterAll(async () => {
    await cleanupStoreDomain(prisma, domain);
    await app.close();
  });

  beforeEach(async () => {
    const menu = await prisma.menu.create({
      data: {
        categoryId: domain.category.id,
        name: `옵션-테스트-${Date.now()}-${Math.random()}`,
        price: 5000,
      },
    });
    menuId = menu.publicId;
  });

  const storeId = () => domain.store.publicId;

  const singleGroup = (
    name: string,
    choiceNames: string[],
    overrides: Partial<CreateMenuOptionPayload> = {}
  ): CreateMenuOptionPayload => ({
    name,
    selectionType: OptionSelectionType.SINGLE,
    required: false,
    minSelect: 0,
    maxSelect: 1,
    enabled: true,
    choices: choiceNames.map((choiceName) => ({
      name: choiceName,
      priceDelta: 0,
      quantityEnabled: false,
      maxQuantity: 1,
      isDefault: false,
      state: OptionChoiceState.AVAILABLE,
    })),
    ...overrides,
  });

  const createOption = (
    name: string,
    choiceNames: string[],
    overrides: Partial<CreateMenuOptionPayload> = {}
  ) =>
    service.createOption(
      domain.owner,
      storeId(),
      menuId,
      singleGroup(name, choiceNames, overrides)
    );

  const optionsOfMenu = async () =>
    await service.getOptionList(domain.owner, storeId(), menuId);

  describe("옵션 조회", () => {
    it("표시 순서대로, 선택지까지 함께 내려준다", async () => {
      const temperature = await createOption("온도", ["HOT", "ICE"]);
      await createOption("컵", ["매장", "테이크아웃"]);

      const options = await service.getOptionList(
        domain.owner,
        storeId(),
        menuId
      );

      expect(options.map((option) => option.name)).toEqual(["온도", "컵"]);
      expect(options[0].choices.map((choice) => choice.publicId)).toEqual(
        temperature.choices.map((choice) => choice.publicId)
      );
    });

    it("옵션이 없는 메뉴는 빈 배열이다", async () => {
      expect(
        await service.getOptionList(domain.owner, storeId(), menuId)
      ).toEqual([]);
    });

    it("단건 조회도 선택지를 함께 내려준다", async () => {
      const created = await createOption("온도", ["HOT", "ICE"]);

      const found = await service.getOption(
        domain.owner,
        storeId(),
        created.publicId
      );

      expect(found).toEqual(created);
    });

    it("다른 매장의 옵션은 조회되지 않는다", async () => {
      const other = await seedStoreDomain(prisma);
      const [foreign] = other.menuWithOptions.options;

      await expect(
        service.getOption(domain.owner, storeId(), foreign.publicId)
      ).rejects.toThrow();

      await cleanupStoreDomain(prisma, other);
    });
  });

  describe("옵션 생성", () => {
    it("메뉴 안 맨 뒤에 붙고 선택지 순서는 배열 순서를 따른다", async () => {
      await createOption("온도", ["HOT", "ICE"]);
      const second = await createOption("컵", ["매장", "테이크아웃"]);

      expect(second.sortOrder).toBe(20);
      expect(second.choices.map((choice) => choice.sortOrder)).toEqual([
        10, 20,
      ]);
    });

    it("같은 메뉴에 이름이 겹치는 옵션은 만들 수 없다", async () => {
      await createOption("온도", ["HOT", "ICE"]);

      await expect(createOption("온도", ["HOT", "ICE"])).rejects.toThrow();
    });

    it("다른 매장의 메뉴에는 옵션을 붙일 수 없다", async () => {
      const other = await seedStoreDomain(prisma);

      await expect(
        service.createOption(
          domain.owner,
          storeId(),
          other.menuWithOptions.publicId,
          singleGroup("온도", ["HOT"])
        )
      ).rejects.toThrow();

      await cleanupStoreDomain(prisma, other);
    });

    /**
     * 숨김 선택지는 고객 화면에 나오지 않아 minSelect를 채울 수 없다.
     * 스키마는 배열 길이만 보므로(2개 ≥ minSelect 2) 여기서 한 번 더 본다.
     */
    it("숨김 선택지를 빼면 최소 선택 개수를 못 채우는 옵션은 만들 수 없다", async () => {
      await expectHttpExceptionAsync(
        () =>
          service.createOption(domain.owner, storeId(), menuId, {
            ...singleGroup("토핑", ["초코", "딸기"], {
              selectionType: OptionSelectionType.MULTIPLE,
              required: true,
              minSelect: 2,
              maxSelect: 2,
            }),
            choices: [
              {
                name: "초코",
                priceDelta: 0,
                quantityEnabled: false,
                maxQuantity: 1,
                isDefault: false,
                state: OptionChoiceState.AVAILABLE,
              },
              {
                name: "딸기",
                priceDelta: 0,
                quantityEnabled: false,
                maxQuantity: 1,
                isDefault: false,
                state: OptionChoiceState.HIDDEN,
              },
            ],
          }),
        {
          code: "MENU_OPTION_CONSTRAINT_VIOLATION",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });
  });

  describe("옵션 수정", () => {
    it("보낸 값과 저장된 값을 합쳐 정합성을 검사한다", async () => {
      // SINGLE 그룹에 maxSelect만 2로 올리면 selectionType과 어긋난다.
      const option = await createOption("온도", ["HOT", "ICE"]);

      await expectHttpExceptionAsync(
        () =>
          service.updateOption(domain.owner, storeId(), option.publicId, {
            maxSelect: 2,
          }),
        {
          code: "MENU_OPTION_CONSTRAINT_VIOLATION",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("selectionType과 maxSelect를 함께 보내면 통과한다", async () => {
      const option = await createOption("토핑", ["초코", "딸기"]);

      const updated = await service.updateOption(
        domain.owner,
        storeId(),
        option.publicId,
        { selectionType: OptionSelectionType.MULTIPLE, maxSelect: 2 }
      );

      expect(updated.maxSelect).toBe(2);
      expect(updated.selectionType).toBe(OptionSelectionType.MULTIPLE);
    });

    it("필수 여부와 최소 선택 개수가 어긋나면 거절한다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      await expectHttpExceptionAsync(
        () =>
          service.updateOption(domain.owner, storeId(), option.publicId, {
            required: true,
          }),
        {
          code: "MENU_OPTION_CONSTRAINT_VIOLATION",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("최소 선택 개수는 숨김을 뺀 선택지 수로 검사한다", async () => {
      const option = await createOption("토핑", ["초코", "딸기"]);
      await prisma.menuOptionChoice.updateMany({
        where: { publicId: option.choices[1].publicId },
        data: { state: OptionChoiceState.HIDDEN },
      });

      // 선택지는 2개지만 고객이 고를 수 있는 건 1개뿐이다.
      await expectHttpExceptionAsync(
        () =>
          service.updateOption(domain.owner, storeId(), option.publicId, {
            selectionType: OptionSelectionType.MULTIPLE,
            required: true,
            minSelect: 2,
            maxSelect: 2,
          }),
        {
          code: "MENU_OPTION_CONSTRAINT_VIOLATION",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("수정해도 publicId는 그대로다 (장바구니가 들고 있는 id)", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      const updated = await service.updateOption(
        domain.owner,
        storeId(),
        option.publicId,
        { name: "온도 선택" }
      );

      expect(updated.publicId).toBe(option.publicId);
      expect(updated.choices.map((choice) => choice.publicId)).toEqual(
        option.choices.map((choice) => choice.publicId)
      );
    });
  });

  describe("트리거", () => {
    it("표시 순서가 뒤인 옵션도 조건으로 참조할 수 있다", async () => {
      const bean = await createOption("원두", ["케냐", "콜롬비아"]);
      const caffeine = await createOption("카페인", ["연하게", "진하게"]);

      // 원두(10)보다 뒤에 있는 카페인(20)이 원두를 참조 → 정상.
      const updated = await service.updateOption(
        domain.owner,
        storeId(),
        caffeine.publicId,
        {
          trigger: [
            { optionId: bean.publicId, choiceIds: [bean.choices[0].publicId] },
          ],
        }
      );

      expect(updated.trigger).toEqual([
        { optionId: bean.publicId, choiceIds: [bean.choices[0].publicId] },
      ]);
    });

    it("재정렬로 참조 대상이 뒤로 밀려도 트리거는 그대로 유효하다", async () => {
      const bean = await createOption("원두", ["케냐", "콜롬비아"]);
      const caffeine = await createOption("카페인", ["연하게", "진하게"]);
      await service.updateOption(domain.owner, storeId(), caffeine.publicId, {
        trigger: [
          { optionId: bean.publicId, choiceIds: [bean.choices[0].publicId] },
        ],
      });

      // 평가는 의존성 순서로 하므로 표시 순서를 뒤집어도 규칙이 살아 있어야 한다.
      await service.reorderOptions(domain.owner, storeId(), menuId, {
        optionIds: [caffeine.publicId, bean.publicId],
      });

      const [first, second] = await optionsOfMenu();
      expect(first.publicId).toBe(caffeine.publicId);
      expect(first.trigger).toEqual([
        { optionId: bean.publicId, choiceIds: [bean.choices[0].publicId] },
      ]);
      expect(second.publicId).toBe(bean.publicId);
    });

    it("자기 자신을 참조하면 거절한다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      await expectHttpExceptionAsync(
        () =>
          service.updateOption(domain.owner, storeId(), option.publicId, {
            trigger: [
              {
                optionId: option.publicId,
                choiceIds: [option.choices[0].publicId],
              },
            ],
          }),
        {
          code: "MENU_OPTION_TRIGGER_CYCLE",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("서로를 참조하는 순환은 거절한다", async () => {
      const first = await createOption("A", ["a1", "a2"]);
      const second = await createOption("B", ["b1", "b2"]);

      await service.updateOption(domain.owner, storeId(), second.publicId, {
        trigger: [
          { optionId: first.publicId, choiceIds: [first.choices[0].publicId] },
        ],
      });

      // B가 A를 보고 있으므로 A가 B를 보면 둘 다 영영 노출되지 않는다.
      await expectHttpExceptionAsync(
        () =>
          service.updateOption(domain.owner, storeId(), first.publicId, {
            trigger: [
              {
                optionId: second.publicId,
                choiceIds: [second.choices[0].publicId],
              },
            ],
          }),
        {
          code: "MENU_OPTION_TRIGGER_CYCLE",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("다른 메뉴의 옵션은 조건으로 참조할 수 없다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);
      const [foreign] = domain.menuWithOptions.options;

      await expectHttpExceptionAsync(
        () =>
          service.updateOption(domain.owner, storeId(), option.publicId, {
            trigger: [
              {
                optionId: foreign.publicId,
                choiceIds: [foreign.choices[0].publicId],
              },
            ],
          }),
        {
          code: "MENU_OPTION_TRIGGER_INVALID",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("참조 대상 옵션을 지우면 그 규칙이 함께 정리된다", async () => {
      const bean = await createOption("원두", ["케냐", "콜롬비아"]);
      const caffeine = await createOption("카페인", ["연하게", "진하게"]);
      await service.updateOption(domain.owner, storeId(), caffeine.publicId, {
        trigger: [
          { optionId: bean.publicId, choiceIds: [bean.choices[0].publicId] },
        ],
      });

      await service.deleteOption(domain.owner, storeId(), bean.publicId);

      // 끊긴 참조를 남기면 카페인 그룹이 영영 노출되지 않는데 점주 화면에는 멀쩡해 보인다.
      const [remaining] = await optionsOfMenu();
      expect(remaining.publicId).toBe(caffeine.publicId);
      expect(remaining.trigger).toBeNull();
    });

    it("참조하던 선택지만 지우면 그 선택지 조건만 빠진다", async () => {
      const bean = await createOption("원두", ["케냐", "콜롬비아"]);
      const caffeine = await createOption("카페인", ["연하게", "진하게"]);
      await service.updateOption(domain.owner, storeId(), caffeine.publicId, {
        trigger: [
          {
            optionId: bean.publicId,
            choiceIds: bean.choices.map((choice) => choice.publicId),
          },
        ],
      });

      await choiceService.deleteChoice(
        domain.owner,
        storeId(),
        bean.choices[0].publicId
      );

      const updated = await optionsOfMenu();
      const triggered = updated.find(
        (option) => option.publicId === caffeine.publicId
      );
      expect(triggered?.trigger).toEqual([
        { optionId: bean.publicId, choiceIds: [bean.choices[1].publicId] },
      ]);
    });

    /**
     * 규칙이 걸고 있던 선택지가 전부 사라지면 그 규칙은 영영 만족될 수 없다.
     * 만족 불가능한 규칙을 남기면 그 그룹이 조용히 사라지므로 규칙째 걷어낸다.
     */
    it("규칙이 걸고 있던 선택지가 모두 사라지면 그 규칙을 버린다", async () => {
      const bean = await createOption("원두", ["케냐", "콜롬비아"]);
      const caffeine = await createOption("카페인", ["연하게", "진하게"]);
      await service.updateOption(domain.owner, storeId(), caffeine.publicId, {
        trigger: [
          { optionId: bean.publicId, choiceIds: [bean.choices[0].publicId] },
        ],
      });

      await choiceService.deleteChoice(
        domain.owner,
        storeId(),
        bean.choices[0].publicId
      );

      const triggered = (await optionsOfMenu()).find(
        (option) => option.publicId === caffeine.publicId
      );
      // 규칙이 하나뿐이었으므로 조건 자체가 없어진다 = 항상 노출.
      expect(triggered?.trigger).toBeNull();
    });

    it("다른 규칙이 남아 있으면 조건은 유지된다", async () => {
      const bean = await createOption("원두", ["케냐", "콜롬비아"]);
      const kind = await createOption("종류", ["아이스", "핫"]);
      const caffeine = await createOption("카페인", ["연하게", "진하게"]);
      await service.updateOption(domain.owner, storeId(), caffeine.publicId, {
        trigger: [
          { optionId: bean.publicId, choiceIds: [bean.choices[0].publicId] },
          { optionId: kind.publicId, choiceIds: [kind.choices[0].publicId] },
        ],
      });

      await choiceService.deleteChoice(
        domain.owner,
        storeId(),
        bean.choices[0].publicId
      );

      const triggered = (await optionsOfMenu()).find(
        (option) => option.publicId === caffeine.publicId
      );
      expect(triggered?.trigger).toEqual([
        { optionId: kind.publicId, choiceIds: [kind.choices[0].publicId] },
      ]);
    });
  });

  describe("재정렬", () => {
    it("요청 순서대로 sparse sortOrder를 다시 매긴다", async () => {
      const first = await createOption("A", ["a1"]);
      const second = await createOption("B", ["b1"]);
      const third = await createOption("C", ["c1"]);

      const reordered = await service.reorderOptions(
        domain.owner,
        storeId(),
        menuId,
        { optionIds: [third.publicId, first.publicId, second.publicId] }
      );

      expect(reordered.map((option) => option.name)).toEqual(["C", "A", "B"]);
      expect(reordered.map((option) => option.sortOrder)).toEqual([10, 20, 30]);
    });

    it("현재 집합과 다르면 409로 거절한다", async () => {
      const first = await createOption("A", ["a1"]);
      await createOption("B", ["b1"]);

      await expectHttpExceptionAsync(
        () =>
          service.reorderOptions(domain.owner, storeId(), menuId, {
            optionIds: [first.publicId],
          }),
        {
          code: "MENU_OPTION_ORDER_MISMATCH",
          status: HttpStatus.CONFLICT,
        }
      );
    });
  });
});
