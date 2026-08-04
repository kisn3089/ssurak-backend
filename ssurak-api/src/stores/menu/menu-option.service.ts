import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
  OptionSelectionType,
  Owner,
  Prisma,
  PublicMenuOptionGroup,
} from "@ssurak/db";
import type {
  CreateMenuOptionPayload,
  MenuOptionTrigger,
  ReorderMenuOptionsPayload,
  UpdateMenuOptionPayload,
} from "@ssurak/schema";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import {
  OPTION_GROUP_VIEW,
  OPTION_ORDER_BY,
} from "src/common/query/menu-query.const";
import { PrismaService } from "src/prisma/prisma.service";
import {
  assertSameSet,
  renumberSortOrder,
  SORT_ORDER_STEP,
} from "src/utils/helper/reorder";
import { Tx } from "src/utils/helper/transactionPipe";
import {
  REORDER_TX_TIMEOUT_MS,
  withReorderLock,
} from "src/utils/helper/withReorderLock";
import { assertNoTriggerCycle } from "./menu-option-trigger";
import {
  assertDefaultCountWithin,
  constraintViolation,
  GroupConstraints,
  pruneTriggersReferencing,
  whereMenuInStore,
  whereOptionInStore,
} from "./menu-option.shared";

@Injectable()
export class MenuOptionService {
  constructor(private readonly prismaService: PrismaService) {}

  /** 한 메뉴의 옵션 전체. 점주용이라 비활성 그룹·숨김 선택지까지 그대로 내려간다. */
  async getOptionList(
    client: Owner,
    storeId: string,
    menuId: string
  ): Promise<PublicMenuOptionGroup[]> {
    const menu = await this.prismaService.menu.findFirstOrThrow({
      where: whereMenuInStore(client, storeId, menuId),
      select: { id: true },
    });

    return await this.prismaService.menuOptionGroup.findMany({
      where: { menuId: menu.id },
      orderBy: OPTION_ORDER_BY,
      ...OPTION_GROUP_VIEW,
    });
  }

  async getOption(
    client: Owner,
    storeId: string,
    optionId: string
  ): Promise<PublicMenuOptionGroup> {
    return await this.prismaService.menuOptionGroup.findFirstOrThrow({
      where: whereOptionInStore(client, storeId, optionId),
      ...OPTION_GROUP_VIEW,
    });
  }

  /** 옵션은 메뉴 안 맨 뒤에 붙는다. 순서 변경은 재정렬 엔드포인트로만 한다. */
  async createOption(
    client: Owner,
    storeId: string,
    menuId: string,
    payload: CreateMenuOptionPayload
  ): Promise<PublicMenuOptionGroup> {
    const { choices, trigger, ...group } = payload;

    return await this.prismaService.$transaction(async (tx) => {
      const menu = await tx.menu.findFirstOrThrow({
        where: whereMenuInStore(client, storeId, menuId),
        select: { id: true },
      });

      await this.assertTriggerIsValid(tx, menu.id, trigger, null);

      return await tx.menuOptionGroup.create({
        data: {
          ...group,
          menuId: menu.id,
          sortOrder: await this.nextGroupSortOrder(tx, menu.id),
          trigger: trigger?.length ? trigger : Prisma.DbNull,
          choices: {
            create: choices.map((choice, index) => ({
              ...choice,
              sortOrder: (index + 1) * SORT_ORDER_STEP,
            })),
          },
        },
        ...OPTION_GROUP_VIEW,
      });
    });
  }

  async updateOption(
    client: Owner,
    storeId: string,
    optionId: string,
    payload: UpdateMenuOptionPayload
  ): Promise<PublicMenuOptionGroup> {
    const { trigger, ...rest } = payload;

    return await this.prismaService.$transaction(async (tx) => {
      const current = await tx.menuOptionGroup.findFirstOrThrow({
        where: whereOptionInStore(client, storeId, optionId),
        select: {
          id: true,
          menuId: true,
          selectionType: true,
          required: true,
          minSelect: true,
          maxSelect: true,
          _count: { select: { choices: true } },
          choices: { select: { isDefault: true, state: true } },
        },
      });

      // 부분 수정이라 저장값과 합쳐야 정합성을 판단할 수 있다.
      const merged: GroupConstraints = {
        selectionType: rest.selectionType ?? current.selectionType,
        required: rest.required ?? current.required,
        minSelect: rest.minSelect ?? current.minSelect,
        maxSelect: rest.maxSelect ?? current.maxSelect,
      };
      this.assertGroupConstraints(merged, current._count.choices);

      // maxSelect를 줄이면 이미 지정된 기본 선택이 한도를 넘길 수 있다.
      const defaultCount = current.choices.filter(
        (choice) => choice.isDefault
      ).length;
      assertDefaultCountWithin(merged, defaultCount);

      if (trigger !== undefined) {
        await this.assertTriggerIsValid(
          tx,
          current.menuId,
          trigger,
          current.id
        );
      }

      return await tx.menuOptionGroup.update({
        where: { id: current.id },
        data: {
          ...rest,
          ...(trigger !== undefined && {
            trigger: trigger?.length ? trigger : Prisma.DbNull,
          }),
        },
        ...OPTION_GROUP_VIEW,
      });
    });
  }

  /**
   * 옵션을 지우면 선택지는 cascade로 함께 사라진다.
   * 이 옵션을 조건으로 삼던 트리거는 참조가 끊기는데, 런타임 평가기가 미해결 참조를
   * "조건 미충족"으로 보므로 그 그룹은 노출되지 않을 뿐 주문이 깨지지는 않는다.
   * 그래도 조용한 실종을 막기 위해 참조하던 규칙을 함께 정리한다.
   */
  async deleteOption(
    client: Owner,
    storeId: string,
    optionId: string
  ): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      const { id, menuId, publicId } =
        await tx.menuOptionGroup.findFirstOrThrow({
          where: whereOptionInStore(client, storeId, optionId),
          select: { id: true, menuId: true, publicId: true },
        });

      await tx.menuOptionGroup.delete({ where: { id } });
      await pruneTriggersReferencing(tx, menuId, publicId);
    });
  }

  /** 한 메뉴의 옵션 순서를 요청 배열대로 통째로 교체한다(멱등). */
  async reorderOptions(
    client: Owner,
    storeId: string,
    menuId: string,
    { optionIds }: ReorderMenuOptionsPayload
  ): Promise<PublicMenuOptionGroup[]> {
    return await this.prismaService.$transaction(
      (tx) =>
        withReorderLock(tx, storeId, async () => {
          const menu = await tx.menu.findFirstOrThrow({
            where: whereMenuInStore(client, storeId, menuId),
            select: { id: true },
          });

          const current = await tx.menuOptionGroup.findMany({
            where: { menuId: menu.id },
            select: { publicId: true },
          });

          assertSameSet(
            current.map(({ publicId }) => publicId),
            optionIds,
            "MENU_OPTION_ORDER_MISMATCH"
          );

          await renumberSortOrder(tx, "menu_option_group", optionIds);

          return await tx.menuOptionGroup.findMany({
            where: { menuId: menu.id },
            orderBy: OPTION_ORDER_BY,
            ...OPTION_GROUP_VIEW,
          });
        }),
      { timeout: REORDER_TX_TIMEOUT_MS }
    );
  }

  /**
   * 트리거가 가리키는 그룹·선택지가 같은 메뉴 안에 실제로 있는지, 그리고 이 규칙을
   * 더해도 순환이 생기지 않는지 확인한다.
   */
  private async assertTriggerIsValid(
    tx: Tx,
    menuId: bigint,
    trigger: MenuOptionTrigger | null | undefined,
    selfId: bigint | null
  ): Promise<void> {
    if (!trigger?.length) return;

    const groups = await tx.menuOptionGroup.findMany({
      where: { menuId },
      select: {
        id: true,
        publicId: true,
        trigger: true,
        choices: { select: { publicId: true } },
      },
    });

    const choiceIdsByOption = new Map(
      groups.map((group) => [
        group.publicId,
        new Set(group.choices.map((choice) => choice.publicId)),
      ])
    );
    const selfPublicId =
      groups.find((group) => group.id === selfId)?.publicId ?? null;

    trigger.forEach((rule) => {
      if (rule.optionId === selfPublicId) {
        throw new HttpException(
          exceptionContentsIs("MENU_OPTION_TRIGGER_CYCLE"),
          HttpStatus.BAD_REQUEST
        );
      }

      const choiceIds = choiceIdsByOption.get(rule.optionId);
      const unknown = choiceIds
        ? rule.choiceIds.find((choiceId) => !choiceIds.has(choiceId))
        : rule.optionId;

      if (unknown !== undefined) {
        throw new HttpException(
          {
            ...exceptionContentsIs("MENU_OPTION_TRIGGER_INVALID"),
            details: { optionId: rule.optionId, unknown },
          },
          HttpStatus.BAD_REQUEST
        );
      }
    });

    assertNoTriggerCycle(groups, selfPublicId, trigger);
  }

  private assertGroupConstraints(
    { selectionType, required, minSelect, maxSelect }: GroupConstraints,
    choiceCount: number
  ): void {
    if (minSelect > maxSelect) {
      throw constraintViolation(
        "최소 선택 개수가 최대 선택 개수보다 클 수 없습니다."
      );
    }
    if (selectionType === OptionSelectionType.SINGLE && maxSelect !== 1) {
      throw constraintViolation(
        "단일 선택 옵션의 최대 선택 개수는 1이어야 합니다."
      );
    }
    if (required !== minSelect >= 1) {
      throw constraintViolation(
        "필수 여부와 최소 선택 개수가 서로 맞지 않습니다."
      );
    }
    if (minSelect > choiceCount) {
      throw constraintViolation(
        "최소 선택 개수가 선택지 수보다 많을 수 없습니다."
      );
    }
  }

  private async nextGroupSortOrder(tx: Tx, menuId: bigint): Promise<number> {
    const last = await tx.menuOptionGroup.findFirst({
      where: { menuId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? 0) + SORT_ORDER_STEP;
  }
}
