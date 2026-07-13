import z from "zod";
import type { Menu } from "../../types/menu/menu.interface";
import { isoDateTime } from "./common.response";
import {
  menuCustomOptionSchema,
  menuRequiredOptionSchema,
} from "./menuOption.response";

/** 메뉴 응답. `id`·`categoryId`는 스키마에 없으므로 parse 시 제거된다. */
export const publicMenuSchema = z.object({
  publicId: z.string().describe("메뉴 고유 ID"),
  name: z.string().describe("메뉴 이름"),
  price: z.number().describe("가격"),
  description: z.string().nullable().describe("메뉴 설명"),
  imageUrl: z.string().nullable().describe("이미지 URL"),
  isAvailable: z.boolean().describe("판매 가능 여부"),
  sortOrder: z.number().describe("카테고리 내 정렬 순서"),
  requiredOptions: menuRequiredOptionSchema.nullable().describe("필수 옵션"),
  customOptions: menuCustomOptionSchema.nullable().describe("선택 옵션"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
  deletedAt: isoDateTime()
    .nullable()
    .describe("소프트 삭제 시각. 조회에서 걸러지므로 항상 null이다."),
}) satisfies z.ZodType<Menu, z.ZodTypeDef, unknown>;
