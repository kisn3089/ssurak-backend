export type StoreSeed = {
  publicId: string;
  name: string;
  address: string;
  addressDetail: string;
  phone: string;
  businessHours: string;
  description: string;
  isOpen: boolean;
};

// ownerId는 seed.ts에서 소유 점주를 조회해 주입한다.
export const demoStoreSeed: StoreSeed = {
  publicId: "ytwmuk763jytydobq32yq06e",
  name: "스페이스 카페",
  address: "서울시 강남구 테헤란로 123",
  addressDetail: "2층",
  phone: "02-1234-5678",
  businessHours: "월-금: 09:00-22:00, 주말: 10:00-20:00",
  description: "개발용 테스트 카페입니다.",
  isOpen: true,
};

export const testStoreSeed: StoreSeed = {
  publicId: "w5o48ydoexledyv5sosd4kcw",
  name: "테스트 카페",
  address: "서울시 용산구 212",
  addressDetail: "1층",
  phone: "02-1111-5678",
  businessHours: "월-금: 09:00-22:00, 주말: 10:00-20:00",
  description: "테스트 카페입니다.",
  isOpen: true,
};
