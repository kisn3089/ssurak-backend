export type OwnerSeed = {
  email: string;
  // 평문 비밀번호. seed.ts에서 해싱해 저장한다.
  password: string;
  name: string;
  phone: string;
  businessNumber: string;
};

// 데모(발표/시연)용 점주 계정 - demoStore 소유
export const demoOwnerSeed: OwnerSeed = {
  email: "demo@ssurak.com",
  password: "demo1234!",
  name: "테스터",
  phone: "010-1234-5678",
  businessNumber: "123-45-67890",
};

// 일반 테스트용 점주 계정 - testStore 소유
export const testOwnerSeed: OwnerSeed = {
  email: "owner@test.com",
  password: "qwer1234!",
  name: "홍길동",
  phone: "010-1234-5678",
  businessNumber: "121-45-67890",
};
