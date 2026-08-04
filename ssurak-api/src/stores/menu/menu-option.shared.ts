import { HttpException, HttpStatus } from "@nestjs/common";
import { OptionSelectionType, Owner, Prisma } from "@ssurak/db";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { Tx } from "src/utils/helper/transactionPipe";

/**
 * 옵션 그룹과 선택지 서비스가 함께 쓰는 조회 범위·불변식 검사.
 * 두 리소스가 같은 소유권 경계를 공유하고(매장 → 메뉴 → 옵션 → 선택지),
 * 기본 선택 개수 한도처럼 그룹 설정이 선택지 쓰기까지 제약하기 때문에 한곳에 모은다.
 */

/** 그룹 불변식을 검사할 때 필요한 최소 상태. 저장값과 페이로드를 합친 결과다. */
export type GroupConstraints = {
  selectionType: OptionSelectionType;
  required: boolean;
  minSelect: number;
  maxSelect: number;
};

export function whereMenuInStore(
  client: Owner,
  storeId: string,
  menuId: string
): Prisma.MenuWhereInput {
  return { publicId: menuId, ...whereMenuInStoreScope(client, storeId) };
}

export function whereOptionInStore(
  client: Owner,
  storeId: string,
  optionId: string
): Prisma.MenuOptionGroupWhereInput {
  return {
    publicId: optionId,
    menu: whereMenuInStoreScope(client, storeId),
  };
}

export function whereChoiceInStore(
  client: Owner,
  storeId: string,
  choiceId: string
): Prisma.MenuOptionChoiceWhereInput {
  return {
    publicId: choiceId,
    option: { menu: whereMenuInStoreScope(client, storeId) },
  };
}

/** 소프트 삭제된 메뉴의 옵션은 건드릴 수 없다 — 목록에도 안 나온다. */
export function whereMenuInStoreScope(
  client: Owner,
  storeId: string
): Prisma.MenuWhereInput {
  return {
    deletedAt: null,
    category: { store: { publicId: storeId, owner: { id: client.id } } },
  };
}

export function constraintViolation(reason: string): HttpException {
  return new HttpException(
    {
      ...exceptionContentsIs("MENU_OPTION_CONSTRAINT_VIOLATION"),
      details: { reason },
    },
    HttpStatus.BAD_REQUEST
  );
}

export function assertDefaultCountWithin(
  {
    selectionType,
    maxSelect,
  }: Pick<GroupConstraints, "selectionType" | "maxSelect">,
  defaultCount: number
): void {
  const limit = selectionType === OptionSelectionType.SINGLE ? 1 : maxSelect;
  if (defaultCount <= limit) return;

  throw constraintViolation(
    `기본 선택은 최대 ${limit}개까지 지정할 수 있습니다.`
  );
}

/**
 * 삭제된 그룹·선택지를 가리키던 트리거 규칙을 정리한다.
 * 끊긴 참조를 남겨두면 그 그룹이 영영 노출되지 않는데, 점주 화면에는 멀쩡해 보인다.
 */
export async function pruneTriggersReferencing(
  tx: Tx,
  menuId: bigint,
  optionPublicId: string,
  choicePublicId?: string
): Promise<void> {
  const groups = await tx.menuOptionGroup.findMany({
    where: { menuId, trigger: { not: Prisma.DbNull } },
    select: { id: true, trigger: true },
  });

  for (const group of groups) {
    if (!group.trigger?.length) continue;

    let changed = false;
    const pruned = group.trigger.flatMap((rule) => {
      if (rule.optionId !== optionPublicId) return [rule];

      changed = true;
      // 그룹 자체가 사라졌으면 규칙을 통째로 버린다.
      if (choicePublicId === undefined) return [];

      const choiceIds = rule.choiceIds.filter((id) => id !== choicePublicId);
      return choiceIds.length ? [{ ...rule, choiceIds }] : [];
    });

    // 규칙이 살아남으면서 choiceId만 빠질 수 있으므로 길이 비교로는 판정할 수 없다.
    if (!changed) continue;

    await tx.menuOptionGroup.update({
      where: { id: group.id },
      data: { trigger: pruned.length ? pruned : Prisma.DbNull },
    });
  }
}
