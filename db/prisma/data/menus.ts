import type {
  MenuCustomOption,
  MenuRequiredOption,
} from "../../types/menuOptions.type";

export type MenuSeed = {
  publicId: string;
  name: string;
  price: number;
  description: string;
  category: string;
  isAvailable: boolean;
  sortOrder: number;
  imageUrl: string;
  requiredOptions?: MenuRequiredOption;
  customOptions?: MenuCustomOption;
};

// 두 매장에 공통으로 생성되는 메뉴 정의.
// publicId는 매장별로 seed.ts에서 index suffix를 붙여 유일성을 확보한다.
export const menuSeeds: MenuSeed[] = [
  {
    publicId: "rbay46e0wjrj7n1h1q2ain8",
    name: "아메리카노",
    price: 4500,
    description: "신선한 원두로 내린 아메리카노",
    category: "커피",
    isAvailable: true,
    sortOrder: 10,
    imageUrl:
      "https://images.unsplash.com/photo-1531835207745-506a1bc035d8?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    requiredOptions: {
      원두: {
        options: [
          { key: "케냐", price: 0 },
          { key: "코스타리코", price: 500 },
        ],
        defaultKey: "케냐",
      },
      종류: {
        options: [
          { key: "아이스", price: 0 },
          { key: "핫", price: 0 },
        ],
        defaultKey: "아이스",
      },
    },
    customOptions: {
      카페인: {
        options: [
          { key: "연하게", price: 0 },
          { key: "진하게", price: 1000 },
        ],
        trigger: [{ group: "원두", in: ["케냐", "코스타리코"] }],
        defaultKey: "연하게",
      },
      얼음: {
        options: [
          { key: "보통", price: 0 },
          { key: "많이", price: 0 },
          { key: "적게", price: 0 },
        ],
        trigger: [{ group: "종류", in: ["아이스"] }],
        defaultKey: "보통",
      },
    },
  },
  {
    publicId: "ohovsqjy5mavzgk1xu187xw",
    name: "카페라떼",
    price: 5000,
    description: "부드러운 우유와 에스프레소의 조화",
    category: "커피",
    isAvailable: true,
    sortOrder: 30,
    imageUrl:
      "https://images.unsplash.com/photo-1729364983489-d4d569978fd7?q=80&w=1296&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "hjpomrh123401gpnvrdl0zi",
    name: "카푸치노",
    price: 5000,
    description: "풍부한 거품의 카푸치노",
    category: "커피",
    isAvailable: true,
    sortOrder: 40,
    imageUrl:
      "https://images.unsplash.com/photo-1534778101976-62847782c213?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "clspywcpjuanpifv64l8qfgq",
    name: "피넛 라떼",
    price: 5500,
    description: "풍부한 거품의 피넛 라뗴",
    category: "커피",
    isAvailable: true,
    sortOrder: 50,
    imageUrl:
      "https://images.unsplash.com/photo-1674038135897-3c22cc49a15e?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    customOptions: {
      휘핑: {
        options: [
          { key: "보통", price: 0 },
          { key: "없이", price: 0 },
          { key: "많이", price: 300 },
        ],
        trigger: [],
        defaultKey: "보통",
      },
    },
  },
  {
    publicId: "lwhdq1qwcmckm3k4nni89b1",
    name: "크로와상",
    price: 3500,
    description: "버터 풍미 가득한 크로와상",
    category: "디저트",
    isAvailable: true,
    sortOrder: 10,
    imageUrl:
      "https://images.unsplash.com/photo-1681218079567-35aef7c8e7e4?q=80&w=2148&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "d5ghdt3wai43i3jhf3dyk7p",
    name: "치즈케이크",
    price: 6500,
    description: "부드러운 뉴욕 스타일 치즈케이크",
    category: "디저트",
    isAvailable: true,
    sortOrder: 20,
    imageUrl:
      "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?q=80&w=2340&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "bun98dtbprj7lyessgn1i8f5",
    name: "플레인 크로플",
    price: 3500,
    description: "부드러운 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 30,
    imageUrl:
      "https://images.unsplash.com/photo-1558584724-0e4d32ca55a4?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    customOptions: {
      "메뉴 추가": {
        options: [
          { key: "없이", price: 0 },
          { key: "딸기잼", price: 500 },
          { key: "크림치즈28g", price: 1000 },
        ],
        trigger: [],
        defaultKey: "없이",
      },
    },
  },
  {
    publicId: "gyi72p9yncptb62pb2pcc34g",
    name: "초코 크로플",
    price: 4000,
    description: "부드러운 초콜릿이 듬뿍 들어간 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 40,
    imageUrl:
      "https://images.unsplash.com/photo-1737700087938-ebdf93f15b50?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "b10c9h3cg23ghiio7njqolxs",
    name: "카라멜 크로플",
    price: 4000,
    description: "부드러운 초콜릿이 듬뿍 들어간 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 50,
    imageUrl:
      "https://images.unsplash.com/photo-1627435605887-326ef07f81f2?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "fgigzvvca0l01qkbqklo01jd",
    name: "소금빵",
    price: 4000,
    description: "부드러운 소금빵",
    category: "디저트",
    isAvailable: true,
    sortOrder: 60,
    imageUrl:
      "https://images.unsplash.com/photo-1733210437318-b76aca1f18ba?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "lxuurz3i3pficmjadk3vifhx",
    name: "초코 소금빵",
    price: 4500,
    description: "부드러운 초코 소금빵",
    category: "디저트",
    isAvailable: true,
    sortOrder: 70,
    imageUrl:
      "https://images.unsplash.com/photo-1686172368295-6d72432ca765?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "n9553xbiawzgrd86xrkq2gvc",
    name: "치아바타",
    price: 5500,
    description: "부드러운 치아바타",
    category: "디저트",
    isAvailable: true,
    sortOrder: 80,
    imageUrl:
      "https://images.unsplash.com/photo-1586657395688-476c3f92b5f6?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "my3yamq9rk252r3g0rj48a6g",
    name: "티라미수",
    price: 5000,
    description: "부드러운 티라미수",
    category: "디저트",
    isAvailable: true,
    sortOrder: 90,
    imageUrl:
      "https://images.unsplash.com/photo-1639744211487-b27e3551b07c?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    publicId: "tq2qu2n7aayzxzf837cto4a",
    name: "드립 커피",
    price: 4600,
    description: "최고급 원두로 내린 드립 커피",
    category: "커피",
    isAvailable: true,
    sortOrder: 20,
    imageUrl:
      "https://images.unsplash.com/photo-1587955245893-389f2215c6eb?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    customOptions: {
      얼음: {
        options: [
          { key: "보통", price: 0 },
          { key: "많이", price: 0 },
          { key: "적게", price: 0 },
        ],
        defaultKey: "보통",
      },
    },
  },
];
