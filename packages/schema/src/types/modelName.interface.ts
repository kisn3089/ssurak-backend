/**
 * DB 모델 이름. 백엔드 Prisma 스키마의 모델과 1:1로 대응한다.
 * 스키마에 모델이 추가되면 여기에도 함께 추가해야 한다.
 */
export type ModelName =
  | "Admin"
  | "Owner"
  | "Store"
  | "Category"
  | "Table"
  | "Menu"
  | "Order"
  | "OrderItem"
  | "TableSession";
