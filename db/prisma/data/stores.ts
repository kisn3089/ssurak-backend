export type StoreSeed = {
  publicId: string;
  name: string;
  address: string;
  addressDetail: string;
  phone: string;
  description: string;
  isPaused: boolean;
  timezone: string;
  businessDayCutoff: number;
  orderNumberPrefix: string;
};

// ownerId는 seed.ts에서 소유 점주를 조회해 주입한다.
// 영업시간·휴무일은 별도 테이블이므로 data/businessHours.ts에서 관리한다.
export const demoStoreSeed: StoreSeed = {
  publicId: "ytwmuk763jytydobq32yq06e",
  name: "스페이스 카페",
  address: "서울시 강남구 테헤란로 123",
  addressDetail: "2층",
  phone: "02-1234-5678",
  description: "개발용 테스트 카페입니다.",
  isPaused: false,
  timezone: "Asia/Seoul",
  businessDayCutoff: 300,
  orderNumberPrefix: "A",
};

export const testStoreSeed: StoreSeed = {
  publicId: "w5o48ydoexledyv5sosd4kcw",
  name: "테스트 카페",
  address: "서울시 용산구 212",
  addressDetail: "1층",
  phone: "02-1111-5678",
  description: "테스트 카페입니다.",
  isPaused: false,
  timezone: "Asia/Seoul",
  businessDayCutoff: 300,
  orderNumberPrefix: "A",
};
