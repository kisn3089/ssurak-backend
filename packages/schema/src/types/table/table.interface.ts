/** 테이블 응답. 서버는 `id`·`storeId`와 관계 필드를 제외하고 내려준다. */
export interface Table {
  publicId: string;
  tableNumber: string;
  seats: number | null;
  /** 층수 (1층, 2층 등) */
  floor: number | null;
  /** 구역 (예: "A구역", "야외", "룸") */
  section: string | null;
  isActive: boolean;
  qrCode: string;
  createdAt: string;
  updatedAt: string;
}
