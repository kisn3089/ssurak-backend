export type TableSeed = {
  publicId: string;
  tableNumber: string;
  qrCode: string;
  seats: number;
  floor: number;
  section: string;
  isActive: boolean;
};

// storeId는 seed.ts에서 주입한다.
// demoStore / testStore는 서로 다른 더미 값(publicId·qrCode·좌석·층·구역)을 갖는다.
export const demoTableSeeds: TableSeed[] = [
  {
    publicId: "ue14s3rhgdrci9lnua1eqd58",
    tableNumber: "1",
    qrCode: "m66dsn0yfgdm08gugosx0j8k",
    seats: 2,
    floor: 1,
    section: "창가",
    isActive: true,
  },
  {
    publicId: "oa5zcc6kl8du8g9z7zvqjrkg",
    tableNumber: "2",
    qrCode: "n7gfe6am4s8zvz2g1rsnl61o",
    seats: 2,
    floor: 1,
    section: "입구",
    isActive: true,
  },
  {
    publicId: "bpfvgpx5ch1qnm6i5d8fa75y",
    tableNumber: "3",
    qrCode: "jrdprt65xh6kiqrlpireptei",
    seats: 4,
    floor: 1,
    section: "메인 홀",
    isActive: true,
  },
  {
    publicId: "lhc7159zorfjk1ojs4g77yzr",
    tableNumber: "4",
    qrCode: "lhc7159zorfjk1ojs4g77yzr",
    seats: 4,
    floor: 1,
    section: "메인 홀",
    isActive: true,
  },
  {
    publicId: "n0e72gbtnstf9d96bur1im92",
    tableNumber: "5",
    qrCode: "fwbs5gh9anqct151lbqb8z7e",
    seats: 6,
    floor: 1,
    section: "VIP룸",
    isActive: false,
  },
];

export const testTableSeeds: TableSeed[] = [
  {
    publicId: "e8jyuukojpwpjh1472qc0mdt",
    tableNumber: "1",
    qrCode: "1dnhep70iwu4p09ch50k5xm6",
    seats: 4,
    floor: 1,
    section: "테라스",
    isActive: true,
  },
  {
    publicId: "makirbncpyee13nw1m44uma4",
    tableNumber: "2",
    qrCode: "nh78txnlr6w941krwigez30a",
    seats: 4,
    floor: 1,
    section: "테라스",
    isActive: true,
  },
  {
    publicId: "r8uemykmcwqsg4fk5fmy5m96",
    tableNumber: "3",
    qrCode: "al146m522p1b98dyduf3f5a1",
    seats: 2,
    floor: 1,
    section: "바",
    isActive: true,
  },
  {
    publicId: "6e0svlwwo1i2ifa0i39o7bjz",
    tableNumber: "4",
    qrCode: "unfb0406doui0w0pi0os1zh3",
    seats: 6,
    floor: 1,
    section: "바",
    isActive: true,
  },
  {
    publicId: "0my3cdmby5hren6d2cg5y495",
    tableNumber: "5",
    qrCode: "vzegfr3gmzmi38yzjy6qepai",
    seats: 8,
    floor: 1,
    section: "루프탑",
    isActive: false,
  },
];
