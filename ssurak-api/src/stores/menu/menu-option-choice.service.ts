import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { OptionChoiceState, Owner, PublicMenuOptionChoice } from "@ssurak/db";
import type {
  CreateOptionChoicePayload,
  ReorderOptionChoicesPayload,
  UpdateOptionChoicePayload,
} from "@ssurak/schema";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import {
  OPTION_CHOICE_VIEW,
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
import {
  assertDefaultCountWithin,
  constraintViolation,
  pruneTriggersReferencing,
  whereChoiceInStore,
  whereOptionInStore,
} from "./menu-option.shared";

/**
 * 옵션 선택지 CRUD.
 *
 * 그룹과 나눠 둔 이유는 검증의 방향이 다르기 때문이다 — 그룹 쓰기는 트리거 그래프
 * (메뉴 전체)를 봐야 하고, 선택지 쓰기는 부모 그룹의 설정(기본 선택 한도·최소 선택 개수)만
 * 보면 된다. 두 쓰기가 공유하는 소유권 범위와 불변식은 menu-option.shared.ts에 있다.
 */
@Injectable()
export class MenuOptionChoiceService {
  constructor(private readonly prismaService: PrismaService) {}

  /** 한 옵션의 선택지 전체. 점주용이라 HIDDEN 선택지도 그대로 내려간다. */
  async getChoiceList(
    client: Owner,
    storeId: string,
    optionId: string
  ): Promise<PublicMenuOptionChoice[]> {
    const group = await this.prismaService.menuOptionGroup.findFirstOrThrow({
      where: whereOptionInStore(client, storeId, optionId),
      select: { id: true },
    });

    return await this.prismaService.menuOptionChoice.findMany({
      where: { optionGroupId: group.id },
      orderBy: OPTION_ORDER_BY,
      ...OPTION_CHOICE_VIEW,
    });
  }

  async getChoice(
    client: Owner,
    storeId: string,
    choiceId: string
  ): Promise<PublicMenuOptionChoice> {
    return await this.prismaService.menuOptionChoice.findFirstOrThrow({
      where: whereChoiceInStore(client, storeId, choiceId),
      ...OPTION_CHOICE_VIEW,
    });
  }

  /** 선택지는 옵션 안 맨 뒤에 붙는다. 순서 변경은 재정렬 엔드포인트로만 한다. */
  async createChoice(
    client: Owner,
    storeId: string,
    optionId: string,
    payload: CreateOptionChoicePayload
  ): Promise<PublicMenuOptionChoice> {
    return await this.prismaService.$transaction(async (tx) => {
      const group = await tx.menuOptionGroup.findFirstOrThrow({
        where: whereOptionInStore(client, storeId, optionId),
        select: {
          id: true,
          selectionType: true,
          maxSelect: true,
          choices: { select: { isDefault: true } },
        },
      });

      if (payload.isDefault) {
        const defaultCount =
          group.choices.filter((choice) => choice.isDefault).length + 1;
        assertDefaultCountWithin(group, defaultCount);
      }

      return await tx.menuOptionChoice.create({
        data: {
          ...payload,
          optionGroupId: group.id,
          sortOrder: await this.nextChoiceSortOrder(tx, group.id),
        },
        ...OPTION_CHOICE_VIEW,
      });
    });
  }

  async updateChoice(
    client: Owner,
    storeId: string,
    choiceId: string,
    payload: UpdateOptionChoicePayload
  ): Promise<PublicMenuOptionChoice> {
    return await this.prismaService.$transaction(async (tx) => {
      const current = await tx.menuOptionChoice.findFirstOrThrow({
        where: whereChoiceInStore(client, storeId, choiceId),
        select: {
          id: true,
          isDefault: true,
          state: true,
          quantityEnabled: true,
          maxQuantity: true,
          option: {
            select: {
              selectionType: true,
              maxSelect: true,
              choices: { select: { publicId: true, isDefault: true } },
            },
          },
        },
      });

      const quantityEnabled =
        payload.quantityEnabled ?? current.quantityEnabled;
      const maxQuantity = payload.maxQuantity ?? current.maxQuantity;
      if (!quantityEnabled && maxQuantity !== 1) {
        throw constraintViolation(
          "수량 선택을 쓰지 않는 선택지의 최대 수량은 1이어야 합니다."
        );
      }

      const isDefault = payload.isDefault ?? current.isDefault;
      const state = payload.state ?? current.state;
      if (isDefault && state !== OptionChoiceState.AVAILABLE) {
        throw constraintViolation(
          "판매 중이 아닌 선택지는 기본 선택으로 지정할 수 없습니다."
        );
      }

      if (isDefault && !current.isDefault) {
        const defaultCount =
          current.option.choices.filter((choice) => choice.isDefault).length +
          1;
        assertDefaultCountWithin(current.option, defaultCount);
      }

      return await tx.menuOptionChoice.update({
        where: { id: current.id },
        data: payload,
        ...OPTION_CHOICE_VIEW,
      });
    });
  }

  async deleteChoice(
    client: Owner,
    storeId: string,
    choiceId: string
  ): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      const current = await tx.menuOptionChoice.findFirstOrThrow({
        where: whereChoiceInStore(client, storeId, choiceId),
        select: {
          id: true,
          publicId: true,
          option: {
            select: {
              publicId: true,
              menuId: true,
              minSelect: true,
              _count: { select: { choices: true } },
            },
          },
        },
      });

      // 선택지가 없는 그룹은 고를 수 있는 게 없어 무의미하다. 그룹째 지우게 유도한다.
      if (current.option._count.choices <= 1) {
        throw new HttpException(
          exceptionContentsIs("MENU_OPTION_LAST_CHOICE"),
          HttpStatus.CONFLICT
        );
      }

      // 남는 선택지가 최소 선택 개수보다 적으면 그 그룹은 영영 만족될 수 없다.
      if (current.option._count.choices - 1 < current.option.minSelect) {
        throw constraintViolation(
          "최소 선택 개수보다 선택지가 적어집니다. 옵션 설정을 먼저 조정해 주세요."
        );
      }

      await tx.menuOptionChoice.delete({ where: { id: current.id } });
      await pruneTriggersReferencing(
        tx,
        current.option.menuId,
        current.option.publicId,
        current.publicId
      );
    });
  }

  /** 한 옵션의 선택지 순서를 요청 배열대로 통째로 교체한다(멱등). */
  async reorderChoices(
    client: Owner,
    storeId: string,
    optionId: string,
    { choiceIds }: ReorderOptionChoicesPayload
  ): Promise<PublicMenuOptionChoice[]> {
    return await this.prismaService.$transaction(
      (tx) =>
        withReorderLock(tx, storeId, async () => {
          const group = await tx.menuOptionGroup.findFirstOrThrow({
            where: whereOptionInStore(client, storeId, optionId),
            select: { id: true },
          });

          const current = await tx.menuOptionChoice.findMany({
            where: { optionGroupId: group.id },
            select: { publicId: true },
          });

          assertSameSet(
            current.map(({ publicId }) => publicId),
            choiceIds,
            "OPTION_CHOICE_ORDER_MISMATCH"
          );

          await renumberSortOrder(tx, "menu_option_choice", choiceIds);

          return await tx.menuOptionChoice.findMany({
            where: { optionGroupId: group.id },
            orderBy: OPTION_ORDER_BY,
            ...OPTION_CHOICE_VIEW,
          });
        }),
      { timeout: REORDER_TX_TIMEOUT_MS }
    );
  }

  private async nextChoiceSortOrder(
    tx: Tx,
    optionGroupId: bigint
  ): Promise<number> {
    const last = await tx.menuOptionChoice.findFirst({
      where: { optionGroupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? 0) + SORT_ORDER_STEP;
  }
}
