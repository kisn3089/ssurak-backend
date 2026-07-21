import type {
  MenuCustomOption,
  MenuRequiredOption,
} from "../../types/menuOptions.type";

type Images = {
  hero: string;
  thumbnail: string;
};

export type MenuSeed = {
  publicId: string;
  name: string;
  price: number;
  description: string;
  category: string;
  isAvailable: boolean;
  sortOrder: number;
  images: Images;
  requiredOptions?: MenuRequiredOption;
  customOptions?: MenuCustomOption;
};

// 두 매장에 공통으로 생성되는 메뉴 정의.
// publicId는 매장별로 seed.ts에서 index suffix를 붙여 유일성을 확보한다.
//
// imageKey는 dev 버킷에 수동으로 올려둔 샘플 이미지를 가리킨다.
// 개발 환경에서 이미지를 보려면 S3_BUCKET에 아래 객체가 있어야 한다:
//   menu/seed-coffee/hero.webp,   menu/seed-coffee/thumbnail.webp
//   menu/seed-dessert/hero.webp,  menu/seed-dessert/thumbnail.webp
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
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/vces0z57pr4vwbhbmlnbzb5a/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/vces0z57pr4vwbhbmlnbzb5a/thumbnail.webp",
    },
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
    publicId: "tq2qu2n7aayzxzf837cto4a",
    name: "드립 커피",
    price: 4600,
    description: "최고급 원두로 내린 드립 커피",
    category: "커피",
    isAvailable: true,
    sortOrder: 20,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/kq9va1czvbo9b15brjfp6g5o/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/kq9va1czvbo9b15brjfp6g5o/thumbnail.webp",
    },
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
  {
    publicId: "ohovsqjy5mavzgk1xu187xw",
    name: "카페라떼",
    price: 5000,
    description: "부드러운 우유와 에스프레소의 조화",
    category: "커피",
    isAvailable: true,
    sortOrder: 30,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/rm5p9nz4bzv2vvaeep5in0nb/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/rm5p9nz4bzv2vvaeep5in0nb/thumbnail.webp",
    },
  },
  {
    publicId: "hjpomrh123401gpnvrdl0zi",
    name: "카푸치노",
    price: 5000,
    description: "풍부한 거품의 카푸치노",
    category: "커피",
    isAvailable: true,
    sortOrder: 40,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/hv86swmvngbzuxzfx6e96rdc/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/hv86swmvngbzuxzfx6e96rdc/thumbnail.webp",
    },
  },
  {
    publicId: "clspywcpjuanpifv64l8qfgq",
    name: "피넛 라떼",
    price: 5500,
    description: "풍부한 거품의 피넛 라뗴",
    category: "커피",
    isAvailable: true,
    sortOrder: 50,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/ca58mxnw9i8ngajlc0ra9w45/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/ca58mxnw9i8ngajlc0ra9w45/thumbnail.webp",
    },
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
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/vrszq7an1hw5ywd6k3owym20/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/vrszq7an1hw5ywd6k3owym20/thumbnail.webp",
    },
  },
  {
    publicId: "d5ghdt3wai43i3jhf3dyk7p",
    name: "치즈케이크",
    price: 6500,
    description: "부드러운 뉴욕 스타일 치즈케이크",
    category: "디저트",
    isAvailable: true,
    sortOrder: 20,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/gcwdfp67xjfe2g1uc3infy1g/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/gcwdfp67xjfe2g1uc3infy1g/thumbnail.webp",
    },
  },
  {
    publicId: "bun98dtbprj7lyessgn1i8f5",
    name: "플레인 크로플",
    price: 3500,
    description: "부드러운 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 30,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/pw6qgzm21a3gekw0fax93545/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/pw6qgzm21a3gekw0fax93545/thumbnail.webp",
    },
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
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/tm3vbrig4t3xurhtwxf1qps6/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/tm3vbrig4t3xurhtwxf1qps6/thumbnail.webp",
    },
  },
  {
    publicId: "b10c9h3cg23ghiio7njqolxs",
    name: "카라멜 크로플",
    price: 4000,
    description: "부드러운 초콜릿이 듬뿍 들어간 크로플",
    category: "디저트",
    isAvailable: true,
    sortOrder: 50,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/d2zf0d8n1czqgd4ux7p6j5gt/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/d2zf0d8n1czqgd4ux7p6j5gt/thumbnail.webp",
    },
  },
  {
    publicId: "fgigzvvca0l01qkbqklo01jd",
    name: "소금빵",
    price: 4000,
    description: "부드러운 소금빵",
    category: "디저트",
    isAvailable: true,
    sortOrder: 60,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/wyo6uq0a903fft9q5boh3dek/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/wyo6uq0a903fft9q5boh3dek/thumbnail.webp",
    },
  },
  {
    publicId: "lxuurz3i3pficmjadk3vifhx",
    name: "초코 소금빵",
    price: 4500,
    description: "부드러운 초코 소금빵",
    category: "디저트",
    isAvailable: true,
    sortOrder: 70,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/azmi1u7ymc8e5ud4own0gfpl/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/azmi1u7ymc8e5ud4own0gfpl/thumbnail.webp",
    },
  },
  {
    publicId: "n9553xbiawzgrd86xrkq2gvc",
    name: "치아바타",
    price: 5500,
    description: "부드러운 치아바타",
    category: "디저트",
    isAvailable: true,
    sortOrder: 80,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/bggck4lijcxbxyesvvu6so93/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/bggck4lijcxbxyesvvu6so93/thumbnail.webp",
    },
  },
  {
    publicId: "my3yamq9rk252r3g0rj48a6g",
    name: "티라미수",
    price: 5000,
    description: "부드러운 티라미수",
    category: "디저트",
    isAvailable: true,
    sortOrder: 90,
    images: {
      hero: "https://d375hwyebi9mpo.cloudfront.net/menu/pybyfmpqk1jkdiidd5kkwc53/hero.webp",
      thumbnail:
        "https://d375hwyebi9mpo.cloudfront.net/menu/pybyfmpqk1jkdiidd5kkwc53/thumbnail.webp",
    },
  },
];
