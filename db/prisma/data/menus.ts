import { OptionChoiceState, OptionSelectionType, Prisma } from "@prisma/client";
import type { MenuOptionTrigger } from "../../types/menuOptions.type";

/** 시드 publicId에 매장 index를 붙인다. 같은 메뉴가 매장마다 따로 존재한다. */
export const suffixed = (publicId: string, storeIndex: number) =>
  `${publicId}${storeIndex}`;

/**
 * trigger가 가리키는 id에도 같은 suffix를 붙인다.
 *
 * 빼먹으면 에러 없이 다른 매장의 옵션을 가리키게 되고, 조건이 영영 충족되지 않아
 * 해당 그룹이 조용히 사라진다. 시드에서 가장 틀리기 쉬운 지점이다.
 */
export function suffixTrigger(
  trigger: MenuOptionTrigger | undefined,
  storeIndex: number
): MenuOptionTrigger | typeof Prisma.DbNull {
  if (!trigger?.length) return Prisma.DbNull;

  return trigger.map((rule) => ({
    optionId: suffixed(rule.optionId, storeIndex),
    choiceIds: rule.choiceIds.map((id) => suffixed(id, storeIndex)),
  }));
}

/** 옵션 그룹 시드를 Prisma 중첩 create 입력으로. sortOrder는 배열 순서에서 파생한다. */
export function toOptionGroupSeedInput(
  options: OptionGroupSeed[] | undefined,
  storeIndex: number
): Prisma.MenuOptionGroupCreateWithoutMenuInput[] {
  return (options ?? []).map((group, groupIndex) => ({
    publicId: suffixed(group.publicId, storeIndex),
    name: group.name,
    selectionType: group.selectionType,
    required: group.required ?? false,
    minSelect: group.minSelect ?? 0,
    maxSelect: group.maxSelect ?? 1,
    enabled: group.enabled ?? true,
    sortOrder: (groupIndex + 1) * 10,
    trigger: suffixTrigger(group.trigger, storeIndex),
    choices: {
      create: group.choices.map((choice, choiceIndex) => ({
        publicId: suffixed(choice.publicId, storeIndex),
        name: choice.name,
        priceDelta: choice.priceDelta ?? 0,
        quantityEnabled: choice.quantityEnabled ?? false,
        maxQuantity: choice.maxQuantity ?? 1,
        isDefault: choice.isDefault ?? false,
        state: choice.state ?? OptionChoiceState.AVAILABLE,
        sortOrder: (choiceIndex + 1) * 10,
      })),
    },
  }));
}

export type OptionChoiceSeed = {
  /** 매장별 index suffix가 seed.ts에서 붙는다. */
  publicId: string;
  name: string;
  priceDelta?: number;
  quantityEnabled?: boolean;
  maxQuantity?: number;
  isDefault?: boolean;
  state?: OptionChoiceState;
};

export type OptionGroupSeed = {
  publicId: string;
  name: string;
  selectionType: OptionSelectionType;
  required?: boolean;
  minSelect?: number;
  maxSelect?: number;
  enabled?: boolean;
  /** 같은 메뉴 안에서 자기보다 앞에 있는 그룹만 참조한다(런타임 검증과 같은 규칙). */
  trigger?: MenuOptionTrigger;
  choices: OptionChoiceSeed[];
};

export type MenuSeed = {
  publicId: string;
  name: string;
  price: number;
  description: string;
  category: string;
  isAvailable: boolean;
  sortOrder: number;
  /**
   * S3 object key의 prefix(`menu/{cuid}`). variant와 확장자는 뺀다.
   * 최종 URL은 `${CDN_BASE_URL}/${imageKey}/${variant}.webp`로 조립된다.
   */
  imageKey: string;
  /** 옵션 sortOrder는 시드에 적지 않는다 — API와 같이 배열 순서에서 파생한다. */
  options?: OptionGroupSeed[];
};

/**
 * 주문 시드가 아메리카노 옵션 스냅샷을 참조하므로 id를 상수로 뽑아 둔다.
 * 문자열을 양쪽에 손으로 적으면 조용히 어긋난다.
 */
export const AMERICANO_OPTION_IDS = {
  bean: "opt7hqk3rj2avzxnq1ldm4b0",
  beanKenya: "cho2wm5vt8pxk3jr7fa1nqe9",
  beanCostaRica: "cho9xd4bn6vlqz2hme8trkw3",
  kind: "optn5cwz8yqr1tvbxk3hdje7",
  kindIce: "cho4tzr9wbnq6xmv1kf8ephd",
  kindHot: "cho1jmp7dvxq4nbz8ws5rylc",
  caffeine: "optq3fx8mrbwv7ztk2ncdhs1",
  caffeineLight: "chodwn2qkv9xrb5m3tzp6faj",
  caffeineStrong: "cho8vbz1rmqwn4dtx7kchsy2",
  ice: "optzk6wdrn3qbmv9x2thpf5c",
  iceNormal: "chorq5nvzt8wbdk1xm4jyhp7",
  iceMuch: "cho3bwtnq7xzrv2mdk9jfhs4",
  iceLittle: "chowm8dqz2vrn6xbk1tjyp5f",
  shot: "opt5rmwbz9qxdn2vtk7hjc3f",
  shotSingle: "cho6qzrwbn1vdmx8tk4jyfp2",
  shotDecaf: "chob2wnqzr7vxdm3tk9jyfh5",
} as const;

// 두 매장에 공통으로 생성되는 메뉴 정의.
// publicId는 매장별로 seed.ts에서 index suffix를 붙여 유일성을 확보한다.
// 옵션 그룹·선택지 publicId와 trigger의 참조 id에도 같은 suffix가 붙는다.
//
// imageKey는 운영 CDN에 올려둔 샘플 이미지를 가리킨다.
// 이미지를 보려면 각 prefix 아래에 hero.webp / thumbnail.webp가 있어야 한다.
// 없어도 시드와 API는 정상 동작하고 이미지만 깨져 보인다.
export const menuSeeds: MenuSeed[] = [
  {
    publicId: "rbay46e0wjrj7n1h1q2ain8",
    name: "아메리카노",
    price: 4500,
    description: "신선한 원두로 내린 아메리카노",
    category: "커피",
    isAvailable: true,
    sortOrder: 10,
    imageKey: "menu/vces0z57pr4vwbhbmlnbzb5a",
    // 옵션 기능 전체(단일·복수 선택, 수량, 품절, 조건부 노출)를 한 메뉴에서 보여준다.
    options: [
      {
        publicId: AMERICANO_OPTION_IDS.bean,
        name: "원두",
        selectionType: OptionSelectionType.SINGLE,
        required: true,
        minSelect: 1,
        choices: [
          {
            publicId: AMERICANO_OPTION_IDS.beanKenya,
            name: "케냐",
            isDefault: true,
          },
          {
            publicId: AMERICANO_OPTION_IDS.beanCostaRica,
            name: "코스타리코",
            priceDelta: 500,
          },
        ],
      },
      {
        publicId: AMERICANO_OPTION_IDS.kind,
        name: "종류",
        selectionType: OptionSelectionType.SINGLE,
        required: true,
        minSelect: 1,
        choices: [
          {
            publicId: AMERICANO_OPTION_IDS.kindIce,
            name: "아이스",
            isDefault: true,
          },
          { publicId: AMERICANO_OPTION_IDS.kindHot, name: "핫" },
        ],
      },
      {
        publicId: AMERICANO_OPTION_IDS.caffeine,
        name: "카페인",
        selectionType: OptionSelectionType.SINGLE,
        trigger: [
          {
            optionId: AMERICANO_OPTION_IDS.bean,
            choiceIds: [
              AMERICANO_OPTION_IDS.beanKenya,
              AMERICANO_OPTION_IDS.beanCostaRica,
            ],
          },
        ],
        choices: [
          {
            publicId: AMERICANO_OPTION_IDS.caffeineLight,
            name: "연하게",
            isDefault: true,
          },
          {
            publicId: AMERICANO_OPTION_IDS.caffeineStrong,
            name: "진하게",
            priceDelta: 1000,
          },
        ],
      },
      {
        publicId: AMERICANO_OPTION_IDS.ice,
        name: "얼음",
        selectionType: OptionSelectionType.SINGLE,
        trigger: [
          {
            optionId: AMERICANO_OPTION_IDS.kind,
            choiceIds: [AMERICANO_OPTION_IDS.kindIce],
          },
        ],
        choices: [
          {
            publicId: AMERICANO_OPTION_IDS.iceNormal,
            name: "보통",
            isDefault: true,
          },
          { publicId: AMERICANO_OPTION_IDS.iceMuch, name: "많이" },
          { publicId: AMERICANO_OPTION_IDS.iceLittle, name: "적게" },
        ],
      },
      {
        publicId: AMERICANO_OPTION_IDS.shot,
        name: "샷 추가",
        selectionType: OptionSelectionType.MULTIPLE,
        maxSelect: 2,
        choices: [
          {
            publicId: AMERICANO_OPTION_IDS.shotSingle,
            name: "에스프레소 샷",
            priceDelta: 500,
            quantityEnabled: true,
            maxQuantity: 3,
          },
          {
            publicId: AMERICANO_OPTION_IDS.shotDecaf,
            name: "디카페인 샷",
            priceDelta: 800,
            state: OptionChoiceState.SOLD_OUT,
          },
        ],
      },
    ],
  },
  {
    publicId: "tq2qu2n7aayzxzf837cto4a",
    name: "드립 커피",
    price: 4600,
    description: "최고급 원두로 내린 드립 커피",
    category: "커피",
    isAvailable: true,
    sortOrder: 20,
    imageKey: "menu/kq9va1czvbo9b15brjfp6g5o",
    options: [
      {
        publicId: "optdrip1zqwnrbvx3mtk7hj5",
        name: "얼음",
        selectionType: OptionSelectionType.SINGLE,
        choices: [
          {
            publicId: "chodrip1nvzqrwbm2xtk8jy4",
            name: "보통",
            isDefault: true,
          },
          { publicId: "chodrip2wqzrnvbm5xtk1jy9", name: "많이" },
          { publicId: "chodrip3rzqwnvbm7xtk3jy6", name: "적게" },
        ],
      },
    ],
  },
  {
    publicId: "ohovsqjy5mavzgk1xu187xw",
    name: "카페라떼",
    price: 5000,
    description: "부드러운 우유와 에스프레소의 조화",
    category: "커피",
    isAvailable: true,
    sortOrder: 30,
    imageKey: "menu/rm5p9nz4bzv2vvaeep5in0nb",
  },
  {
    publicId: "hjpomrh123401gpnvrdl0zi",
    name: "카푸치노",
    price: 5000,
    description: "풍부한 거품의 카푸치노",
    category: "커피",
    isAvailable: true,
    sortOrder: 40,
    imageKey: "menu/hv86swmvngbzuxzfx6e96rdc",
  },
  {
    publicId: "clspywcpjuanpifv64l8qfgq",
    name: "피넛 라떼",
    price: 5500,
    description: "풍부한 거품의 피넛 라뗴",
    category: "커피",
    isAvailable: true,
    sortOrder: 50,
    imageKey: "menu/ca58mxnw9i8ngajlc0ra9w45",
    options: [
      {
        publicId: "optwhip1qzrnwbvm3xtk5jy8",
        name: "휘핑",
        selectionType: OptionSelectionType.SINGLE,
        choices: [
          {
            publicId: "chowhip1nzqrwbvm4xtk6jy1",
            name: "보통",
            isDefault: true,
          },
          { publicId: "chowhip2rzqnwbvm8xtk2jy7", name: "없이" },
          {
            publicId: "chowhip3wzqrnbvm1xtk9jy3",
            name: "많이",
            priceDelta: 300,
          },
        ],
      },
    ],
  },
  {
    publicId: "lwhdq1qwcmckm3k4nni89b1",
    name: "크로와상",
    price: 3500,
    description: "버터 풍미 가득한 크로와상",
    category: "디저트",
    isAvailable: true,
    sortOrder: 10,
    imageKey: "menu/vrszq7an1hw5ywd6k3owym20",
  },
  {
    publicId: "d5ghdt3wai43i3jhf3dyk7p",
    name: "치즈케이크",
    price: 6500,
    description: "부드러운 뉴욕 스타일 치즈케이크",
    category: "디저트",
    isAvailable: true,
    sortOrder: 20,
    imageKey: "menu/gcwdfp67xjfe2g1uc3infy1g",
  },
  {
    publicId: "bun98dtbprj7lyessgn1i8f5",
    name: "플레인 크로플",
    price: 3500,
    description: "부드러운 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 30,
    imageKey: "menu/pw6qgzm21a3gekw0fax93545",
    options: [
      {
        publicId: "optadd1qzrwnbvm6xtk4jy2s",
        name: "메뉴 추가",
        selectionType: OptionSelectionType.MULTIPLE,
        maxSelect: 2,
        choices: [
          {
            publicId: "choadd1nzqwrbvm9xtk7jy5d",
            name: "딸기잼",
            priceDelta: 500,
          },
          {
            publicId: "choadd2rzqwnbvm2xtk8jy1f",
            name: "크림치즈28g",
            priceDelta: 1000,
          },
        ],
      },
    ],
  },
  {
    publicId: "gyi72p9yncptb62pb2pcc34g",
    name: "초코 크로플",
    price: 4000,
    description: "부드러운 초콜릿이 듬뿍 들어간 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 40,
    imageKey: "menu/tm3vbrig4t3xurhtwxf1qps6",
  },
  {
    publicId: "b10c9h3cg23ghiio7njqolxs",
    name: "카라멜 크로플",
    price: 4000,
    description: "부드러운 초콜릿이 듬뿍 들어간 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 50,
    imageKey: "menu/d2zf0d8n1czqgd4ux7p6j5gt",
  },
  {
    publicId: "fgigzvvca0l01qkbqklo01jd",
    name: "소금빵",
    price: 4000,
    description: "부드러운 소금빵",
    category: "디저트",
    isAvailable: true,
    sortOrder: 60,
    imageKey: "menu/wyo6uq0a903fft9q5boh3dek",
  },
  {
    publicId: "lxuurz3i3pficmjadk3vifhx",
    name: "초코 소금빵",
    price: 4500,
    description: "부드러운 초코 소금빵",
    category: "디저트",
    isAvailable: true,
    sortOrder: 70,
    imageKey: "menu/azmi1u7ymc8e5ud4own0gfpl",
  },
  {
    publicId: "n9553xbiawzgrd86xrkq2gvc",
    name: "치아바타",
    price: 5500,
    description: "부드러운 치아바타",
    category: "디저트",
    isAvailable: true,
    sortOrder: 80,
    imageKey: "menu/bggck4lijcxbxyesvvu6so93",
  },
  {
    publicId: "my3yamq9rk252r3g0rj48a6g",
    name: "티라미수",
    price: 5000,
    description: "부드러운 티라미수",
    category: "디저트",
    isAvailable: true,
    sortOrder: 90,
    imageKey: "menu/pybyfmpqk1jkdiidd5kkwc53",
  },
];
