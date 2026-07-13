import { OrderStatus } from "@prisma/client";
import type { OrderItemOptionSnapshot } from "../../types/menuOptions.type";

export type OrderSeed = {
  publicId: string;
  // testStore 테이블 번호 / 세션 publicId로 FK를 조회해 주입한다.
  tableNumber: string;
  sessionPublicId: string;
  status: OrderStatus;
  memo?: string | null;
  cancelledReason?: string;
  // "now" 기준 몇 분 전인지(분). 지정 시 seed.ts에서 실제 시각으로 변환한다.
  acceptedOffsetMin?: number;
  completedOffsetMin?: number;
};

// session·order 시나리오는 testStore(owner@test.com)에만 적용한다.
export const orderSeeds: OrderSeed[] = [
  // 테이블 1: 아메리카노 2잔 + 크로와상 (COMPLETED)
  {
    publicId: "iz8e7twkcpn232ircc9eyd4q",
    tableNumber: "1",
    sessionPublicId: "m91i4aceil90dukgd22senv5",
    status: OrderStatus.COMPLETED,
    memo: "얼음 많이 넣어주세요",
    acceptedOffsetMin: 30,
    completedOffsetMin: 15,
  },
  // 테이블 1: 카페라떼 1잔 (PENDING)
  {
    publicId: "k8hg56a7jhojhmbmvytdra4w",
    tableNumber: "1",
    sessionPublicId: "m91i4aceil90dukgd22senv5",
    status: OrderStatus.PENDING,
  },
  // 테이블 2: 카푸치노 + 치즈케이크 (PREPARING)
  {
    publicId: "d3gz3p6xmdby60896v2fosui",
    tableNumber: "2",
    sessionPublicId: "o11om68intan0v0ko3x9nlb3",
    status: OrderStatus.PREPARING,
    memo: "케이크 포크 2개 부탁드려요",
    acceptedOffsetMin: 10,
  },
  // 테이블 4: 드립커피 2잔 + 아메리카노 + 크로와상 + 치즈케이크 (ACCEPTED)
  {
    publicId: "y4yg7t7svyoucz9hl9cd2zur",
    tableNumber: "4",
    sessionPublicId: "x14mlnrh7jqdgziucr2vw1eh",
    status: OrderStatus.ACCEPTED,
    memo: null,
    acceptedOffsetMin: 5,
  },
  // 테이블 4: 카페라떼 (CANCELLED)
  {
    publicId: "m93yqrg1qna04pxi95d0qi5g",
    tableNumber: "4",
    sessionPublicId: "x14mlnrh7jqdgziucr2vw1eh",
    status: OrderStatus.CANCELLED,
    cancelledReason: "메뉴 변경",
  },
];

export type OrderItemSeed = {
  publicId: string;
  // 소속 주문 publicId / 메뉴명으로 FK와 이미지 URL을 조회해 주입한다.
  orderPublicId: string;
  menuName: string;
  basePrice: number;
  optionsPrice: number;
  unitPrice: number;
  quantity: number;
  optionsSnapshot?: OrderItemOptionSnapshot;
};

export const orderItemSeeds: OrderItemSeed[] = [
  // Order 1 (테이블 1 - COMPLETED): 아메리카노 2잔 + 크로와상
  {
    publicId: "zootdtfjvajoivq0x9dlf80j",
    orderPublicId: "iz8e7twkcpn232ircc9eyd4q",
    menuName: "아메리카노",
    basePrice: 4500,
    optionsPrice: 2000,
    unitPrice: 6500,
    quantity: 2,
    optionsSnapshot: {
      requiredOptions: {
        원두: { key: "케냐", price: 0 },
        종류: { key: "아이스", price: 0 },
      },
      customOptions: {
        카페인: { key: "진하게", price: 1000 },
        얼음: { key: "많이", price: 0 },
      },
    },
  },
  {
    publicId: "cyw8f52pazpolcp3nthvae1w",
    orderPublicId: "iz8e7twkcpn232ircc9eyd4q",
    menuName: "크로와상",
    basePrice: 3500,
    optionsPrice: 0,
    unitPrice: 3500,
    quantity: 1,
  },
  // Order 2 (테이블 1 - PENDING): 카페라떼 1잔
  {
    publicId: "d6dmaaniichb00uirp98wcmu",
    orderPublicId: "k8hg56a7jhojhmbmvytdra4w",
    menuName: "카페라떼",
    basePrice: 5000,
    optionsPrice: 0,
    unitPrice: 5000,
    quantity: 1,
  },
  // Order 3 (테이블 2 - PREPARING): 카푸치노 + 치즈케이크
  {
    publicId: "zfknocuq7f3jf5mye1svzxry",
    orderPublicId: "d3gz3p6xmdby60896v2fosui",
    menuName: "카푸치노",
    basePrice: 5000,
    optionsPrice: 0,
    unitPrice: 5000,
    quantity: 1,
  },
  {
    publicId: "ob8xkpnlc9l0z322r6abmzab",
    orderPublicId: "d3gz3p6xmdby60896v2fosui",
    menuName: "치즈케이크",
    basePrice: 6500,
    optionsPrice: 0,
    unitPrice: 6500,
    quantity: 1,
  },
  // Order 4 (테이블 4 - ACCEPTED): 드립커피 2잔 + 아메리카노 + 크로와상 + 치즈케이크
  {
    publicId: "qnavcav7tiaao582qomf5asr",
    orderPublicId: "y4yg7t7svyoucz9hl9cd2zur",
    menuName: "드립 커피",
    basePrice: 4600,
    optionsPrice: 500,
    unitPrice: 5100,
    quantity: 2,
    optionsSnapshot: {
      customOptions: { 얼음: { key: "적게", price: 0 } },
    },
  },
  {
    publicId: "i0vsjtnf5hqmz7acfp55oblp",
    orderPublicId: "y4yg7t7svyoucz9hl9cd2zur",
    menuName: "아메리카노",
    basePrice: 4500,
    optionsPrice: 500,
    unitPrice: 5000,
    quantity: 1,
    optionsSnapshot: {
      requiredOptions: {
        원두: { key: "코스타리코", price: 500 },
        종류: { key: "핫", price: 0 },
      },
      customOptions: { 카페인: { key: "연하게", price: 0 } },
    },
  },
  {
    publicId: "kzotggj34fp2sicjxm5378mf",
    orderPublicId: "y4yg7t7svyoucz9hl9cd2zur",
    menuName: "크로와상",
    basePrice: 3500,
    optionsPrice: 0,
    unitPrice: 3500,
    quantity: 1,
  },
  {
    publicId: "dwcxu6otu2dt5h8ehfbh7njn",
    orderPublicId: "y4yg7t7svyoucz9hl9cd2zur",
    menuName: "치즈케이크",
    basePrice: 6500,
    optionsPrice: 0,
    unitPrice: 6500,
    quantity: 1,
  },
  // Order 5 (테이블 4 - CANCELLED): 카페라떼
  {
    publicId: "r0are9ygvbtsvotuu91763hx",
    orderPublicId: "m93yqrg1qna04pxi95d0qi5g",
    menuName: "카페라떼",
    basePrice: 5000,
    optionsPrice: 0,
    unitPrice: 5000,
    quantity: 1,
  },
];
