import z from "zod";
import type { CategoryResponse } from "../../types/category/category.interface";
import { isoDateTime } from "./common.response";

/**
 * 점주 카테고리 관리 응답. `id`·`storeId`는 스키마에 없으므로 parse 시 제거된다.
 * 메뉴는 실리지 않는다 — 메뉴까지 필요하면 `GET /stores/{storeId}/menus`를 쓴다.
 */
export const publicCategorySchema = z.object({
  publicId: z.string().describe("카테고리 고유 ID"),
  name: z.string().describe("카테고리 이름"),
  sortOrder: z.number().describe("카테고리 표시 순서"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
}) satisfies z.ZodType<CategoryResponse, z.ZodTypeDef, unknown>;
