import { HttpStatus, INestApplication } from "@nestjs/common";
import { OptionChoiceState, OptionSelectionType } from "@ssurak/db";
import type { CreateMenuOptionPayload } from "@ssurak/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "src/prisma/prisma.service";
import { MenuOptionChoiceService } from "src/stores/menu/menu-option-choice.service";
import { MenuOptionService } from "src/stores/menu/menu-option.service";
import { createTestApp } from "test/helpers/create-test-app";
import { expectHttpExceptionAsync } from "test/helpers/expect-http-exception";
import {
  cleanupStoreDomain,
  seedStoreDomain,
  SeededStoreDomain,
} from "test/helpers/seed-store";

describe("MenuOptionChoiceService (통합)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: MenuOptionChoiceService;
  let optionService: MenuOptionService;
  let domain: SeededStoreDomain;
  /** 케이스마다 새 메뉴를 만들어 옵션 조작이 서로 간섭하지 않게 한다. */
  let menuId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    service = app.get(MenuOptionChoiceService);
    optionService = app.get(MenuOptionService);
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
        name: `선택지-테스트-${Date.now()}-${Math.random()}`,
        price: 5000,
      },
    });
    menuId = menu.publicId;
  });

  const storeId = () => domain.store.publicId;

  const createOption = (
    name: string,
    choiceNames: string[],
    overrides: Partial<CreateMenuOptionPayload> = {}
  ) =>
    optionService.createOption(domain.owner, storeId(), menuId, {
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

  describe("조회", () => {
    it("표시 순서대로 내려준다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      const choices = await service.getChoiceList(
        domain.owner,
        storeId(),
        option.publicId
      );

      expect(choices).toEqual(option.choices);
    });

    it("숨김 선택지도 점주에게는 내려간다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);
      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[1].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      const choices = await service.getChoiceList(
        domain.owner,
        storeId(),
        option.publicId
      );

      expect(choices.map((choice) => choice.name)).toEqual(["HOT", "ICE"]);
    });

    it("단건 조회는 publicId로 바로 찾는다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      const found = await service.getChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId
      );

      expect(found).toEqual(option.choices[0]);
    });

    it("다른 매장의 선택지는 조회되지 않는다", async () => {
      const other = await seedStoreDomain(prisma);
      const [foreign] = other.menuWithOptions.options;

      await expect(
        service.getChoice(domain.owner, storeId(), foreign.choices[0].publicId)
      ).rejects.toThrow();

      await cleanupStoreDomain(prisma, other);
    });
  });

  describe("쓰기", () => {
    it("추가하면 그룹 안 맨 뒤에 붙는다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      const added = await service.createChoice(
        domain.owner,
        storeId(),
        option.publicId,
        {
          name: "미지근",
          priceDelta: 0,
          quantityEnabled: false,
          maxQuantity: 1,
          isDefault: false,
          state: OptionChoiceState.AVAILABLE,
        }
      );

      expect(added.sortOrder).toBe(30);
    });

    it("SINGLE 그룹에 기본 선택을 둘째로 지정하면 거절한다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);
      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId,
        { isDefault: true }
      );

      await expectHttpExceptionAsync(
        () =>
          service.updateChoice(
            domain.owner,
            storeId(),
            option.choices[1].publicId,
            { isDefault: true }
          ),
        {
          code: "MENU_OPTION_CONSTRAINT_VIOLATION",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("품절 처리하면서 기본 선택으로 두려 하면 거절한다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);
      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId,
        { isDefault: true }
      );

      await expectHttpExceptionAsync(
        () =>
          service.updateChoice(
            domain.owner,
            storeId(),
            option.choices[0].publicId,
            { state: OptionChoiceState.SOLD_OUT }
          ),
        {
          code: "MENU_OPTION_CONSTRAINT_VIOLATION",
          status: HttpStatus.BAD_REQUEST,
        }
      );
    });

    it("품절 처리는 publicId를 유지한다 (장바구니가 들고 있는 id)", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      const updated = await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId,
        { state: OptionChoiceState.SOLD_OUT }
      );

      expect(updated.publicId).toBe(option.choices[0].publicId);
      expect(updated.state).toBe(OptionChoiceState.SOLD_OUT);
    });

    it("마지막 선택지는 삭제할 수 없다", async () => {
      const option = await createOption("온도", ["HOT"]);

      await expectHttpExceptionAsync(
        () =>
          service.deleteChoice(
            domain.owner,
            storeId(),
            option.choices[0].publicId
          ),
        {
          code: "MENU_OPTION_LAST_CHOICE",
          status: HttpStatus.CONFLICT,
        }
      );
    });

    /** 숨김 처리와 같은 규칙 — 막지 않고 남는 개수에 맞춰 최소 선택 개수를 내린다. */
    it("삭제로 선택지가 줄면 최소 선택 개수를 함께 내린다", async () => {
      const option = await createOption("토핑", ["초코", "딸기"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 2,
        maxSelect: 2,
      });

      await service.deleteChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId
      );

      const updated = await optionService.getOption(
        domain.owner,
        storeId(),
        option.publicId
      );
      expect(updated.minSelect).toBe(1);
      expect(updated.required).toBe(true);
    });

    /**
     * 숨김 선택지는 고객 화면에 아예 나오지 않아 minSelect를 채울 수 없다.
     * 전체 개수로 세면 "선택지는 2개인데 고를 수 있는 건 1개"인 옵션이 남는다.
     */
    it("숨김 선택지는 삭제 후 남는 개수에 포함하지 않는다", async () => {
      const option = await createOption("토핑", ["초코", "딸기", "바닐라"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 2,
        maxSelect: 3,
      });
      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[2].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      await service.deleteChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId
      );

      // 남은 건 딸기(노출) + 바닐라(숨김) → 고를 수 있는 건 1개뿐이다.
      const updated = await optionService.getOption(
        domain.owner,
        storeId(),
        option.publicId
      );
      expect(updated.minSelect).toBe(1);
    });

    it("삭제로 고를 수 있는 선택지가 없어지면 필수도 함께 풀린다", async () => {
      const option = await createOption("토핑", ["초코", "바닐라"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 1,
        maxSelect: 2,
      });
      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[1].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      // 노출되는 마지막 선택지를 지운다(행은 숨김 하나가 남으므로 LAST_CHOICE는 아니다).
      await service.deleteChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId
      );

      const updated = await optionService.getOption(
        domain.owner,
        storeId(),
        option.publicId
      );
      expect(updated.minSelect).toBe(0);
      expect(updated.required).toBe(false);
    });

    it("숨김 선택지를 지우는 것은 고를 수 있는 개수를 줄이지 않아 통과한다", async () => {
      const option = await createOption("토핑", ["초코", "딸기", "바닐라"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 2,
        maxSelect: 3,
      });
      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[2].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      await service.deleteChoice(
        domain.owner,
        storeId(),
        option.choices[2].publicId
      );

      const remaining = await service.getChoiceList(
        domain.owner,
        storeId(),
        option.publicId
      );
      expect(remaining.map((choice) => choice.name)).toEqual(["초코", "딸기"]);
    });

    /**
     * 숨김은 되돌릴 수 있는 조작이라 막지 않는다. 대신 남는 선택지로 채울 수 있는
     * 최대값까지 최소 선택 개수를 함께 내려 "영영 만족 못 하는 옵션"이 생기지 않게 한다.
     */
    it("숨김으로 돌리면 최소 선택 개수를 채울 수 있는 최대값으로 내린다", async () => {
      const option = await createOption("토핑", ["초코", "딸기"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 2,
        maxSelect: 2,
      });

      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      const updated = await optionService.getOption(
        domain.owner,
        storeId(),
        option.publicId
      );
      expect(updated.minSelect).toBe(1);
      // 아직 하나는 고를 수 있으니 필수는 그대로 남는다.
      expect(updated.required).toBe(true);
      expect(updated.maxSelect).toBe(2);
    });

    it("고를 수 있는 선택지가 하나도 남지 않으면 필수도 함께 풀린다", async () => {
      const option = await createOption("토핑", ["초코", "딸기"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 1,
        maxSelect: 2,
      });
      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[1].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      const updated = await optionService.getOption(
        domain.owner,
        storeId(),
        option.publicId
      );
      expect(updated.minSelect).toBe(0);
      expect(updated.required).toBe(false);
    });

    it("최소 선택 개수를 이미 채울 수 있으면 옵션 설정을 건드리지 않는다", async () => {
      const option = await createOption("토핑", ["초코", "딸기", "바닐라"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 1,
        maxSelect: 3,
      });

      await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId,
        { state: OptionChoiceState.HIDDEN }
      );

      const updated = await optionService.getOption(
        domain.owner,
        storeId(),
        option.publicId
      );
      expect(updated.minSelect).toBe(1);
      expect(updated.required).toBe(true);
    });

    /** 품절은 일시적인 재고 상태라 설정 검사에서 빼지 않는다. 막으면 운영이 불가능해진다. */
    it("품절 처리는 최소 선택 개수와 무관하게 통과한다", async () => {
      const option = await createOption("토핑", ["초코", "딸기"], {
        selectionType: OptionSelectionType.MULTIPLE,
        required: true,
        minSelect: 2,
        maxSelect: 2,
      });

      const updated = await service.updateChoice(
        domain.owner,
        storeId(),
        option.choices[0].publicId,
        { state: OptionChoiceState.SOLD_OUT }
      );

      expect(updated.state).toBe(OptionChoiceState.SOLD_OUT);
    });
  });

  describe("재정렬", () => {
    it("요청 순서대로 sparse sortOrder를 다시 매긴다", async () => {
      const option = await createOption("온도", ["HOT", "ICE", "미지근"]);
      const [hot, ice, warm] = option.choices;

      const reordered = await service.reorderChoices(
        domain.owner,
        storeId(),
        option.publicId,
        { choiceIds: [warm.publicId, hot.publicId, ice.publicId] }
      );

      expect(reordered.map((choice) => choice.name)).toEqual([
        "미지근",
        "HOT",
        "ICE",
      ]);
      expect(reordered.map((choice) => choice.sortOrder)).toEqual([10, 20, 30]);
    });

    it("현재 집합과 다르면 409로 거절한다", async () => {
      const option = await createOption("온도", ["HOT", "ICE"]);

      await expectHttpExceptionAsync(
        () =>
          service.reorderChoices(domain.owner, storeId(), option.publicId, {
            choiceIds: [option.choices[0].publicId],
          }),
        {
          code: "OPTION_CHOICE_ORDER_MISMATCH",
          status: HttpStatus.CONFLICT,
        }
      );
    });
  });
});
