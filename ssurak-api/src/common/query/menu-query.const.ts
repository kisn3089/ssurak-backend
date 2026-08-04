import { OptionChoiceState, Prisma } from "@ssurak/db";

/** 옵션 그룹·선택지 모두 메뉴·카테고리와 같은 결정적 정렬을 쓴다. */
export const OPTION_ORDER_BY = [
  { sortOrder: "asc" },
  { id: "asc" },
] satisfies Prisma.MenuOptionGroupOrderByWithRelationInput[];

const OMIT_OPTION_GROUP_PRIVATE = { id: true, menuId: true } as const;
const OMIT_OPTION_CHOICE_PRIVATE = { id: true, optionGroupId: true } as const;

/**
 * 옵션 단건·목록 응답 모양. 메뉴 응답 안의 `options` 항목과 같은 모양을 유지해야
 * 프론트가 옵션 하나만 다시 그릴 때 별도 매퍼를 두지 않아도 된다.
 */
export const OPTION_GROUP_VIEW = {
  omit: OMIT_OPTION_GROUP_PRIVATE,
  include: {
    choices: {
      orderBy: OPTION_ORDER_BY,
      omit: OMIT_OPTION_CHOICE_PRIVATE,
    },
  },
} as const;

export const OPTION_CHOICE_VIEW = { omit: OMIT_OPTION_CHOICE_PRIVATE } as const;

/**
 * 점주 콘솔용. 필터가 없다 — 숨김 선택지와 비활성 그룹까지 보여야 편집할 수 있고,
 * 안 보여주면 응답을 그대로 되돌려 보내는 순간 그 항목들이 조용히 삭제된다.
 */
export const MENU_OPTIONS_INCLUDE_OWNER = {
  options: {
    orderBy: OPTION_ORDER_BY,
    ...OPTION_GROUP_VIEW,
  },
} as const;

/** 고객 메뉴판용. 비활성 그룹과 HIDDEN 선택지를 거른다. */
export const MENU_OPTIONS_INCLUDE_CUSTOMER = {
  options: {
    where: { enabled: true },
    orderBy: OPTION_ORDER_BY,
    omit: OMIT_OPTION_GROUP_PRIVATE,
    include: {
      choices: {
        where: { state: { not: OptionChoiceState.HIDDEN } },
        orderBy: OPTION_ORDER_BY,
        omit: OMIT_OPTION_CHOICE_PRIVATE,
      },
    },
  },
} as const;

/**
 * 주문·장바구니 검증용. 여기서는 아무것도 거르지 않는다 —
 * 숨김·비활성 항목의 존재를 알아야 "그건 고를 수 없다"고 판정할 수 있다.
 */
export const MENU_VALIDATION_FIELDS_SELECT = {
  id: true,
  publicId: true,
  name: true,
  price: true,
  imageKey: true,
  isAvailable: true,
  options: {
    orderBy: OPTION_ORDER_BY,
    select: {
      publicId: true,
      name: true,
      selectionType: true,
      required: true,
      minSelect: true,
      maxSelect: true,
      sortOrder: true,
      enabled: true,
      trigger: true,
      choices: {
        orderBy: OPTION_ORDER_BY,
        select: {
          publicId: true,
          name: true,
          priceDelta: true,
          quantityEnabled: true,
          maxQuantity: true,
          isDefault: true,
          sortOrder: true,
          state: true,
        },
      },
    },
  },
} as const;
