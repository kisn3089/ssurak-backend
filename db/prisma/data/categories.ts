export type CategorySeed = {
  name: string;
  sortOrder: number;
};

// 두 매장에 공통으로 생성되는 카테고리 정의
export const categorySeeds: CategorySeed[] = [
  { name: "커피", sortOrder: 10 },
  { name: "디저트", sortOrder: 20 },
];
