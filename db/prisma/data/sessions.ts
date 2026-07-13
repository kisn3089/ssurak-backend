import { TableSessionStatus } from "@prisma/client";

export type TableSessionSeed = {
  publicId: string;
  // testStore 테이블 번호로 tableId를 조회해 주입한다.
  tableNumber: string;
  status: TableSessionStatus;
  sessionToken: string;
};

// session·order 시나리오는 testStore(owner@test.com)에만 적용한다.
export const tableSessionSeeds: TableSessionSeed[] = [
  {
    publicId: "m91i4aceil90dukgd22senv5",
    tableNumber: "1",
    status: TableSessionStatus.ACTIVE,
    sessionToken: "ZdveYAJITM92Np-2Cd4jv0RrHw6KRkAwOZyGHPStsWs",
  },
  {
    publicId: "o11om68intan0v0ko3x9nlb3",
    tableNumber: "2",
    status: TableSessionStatus.ACTIVE,
    sessionToken: "PQ-mjU8nlFbRVhpS5HvQcL-qlw_-q02VMEhm_i_aaFM",
  },
  {
    publicId: "x14mlnrh7jqdgziucr2vw1eh",
    tableNumber: "4",
    status: TableSessionStatus.ACTIVE,
    sessionToken: "wVecI3NAYcoAZn5Khbq5CLp9P7Qat1yCChSJj8qCJmY",
  },
];
