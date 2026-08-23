import z from "zod";
import type {
  MenuImages,
  Menu,
  MenuWithOptions,
} from "../../types/menu/menu.interface";
import { isoDateTime } from "./common.response";
import { publicMenuOptionGroupSchema } from "./menuOption.response";

export const menuImagesSchema = z.object({
  hero: z.string().describe("메뉴 상세 히어로 (780x585)"),
  thumbnail: z.string().describe("메뉴 리스트 썸네일 (240x240)"),
}) satisfies z.ZodType<MenuImages>;

/**
 * 메뉴 응답. `id`·`imageKey`는 스키마에 없으므로 parse 시 제거된다.
 * `categoryId`는 프론트 메뉴 수정 round-trip(카테고리 매칭)을 위해 노출한다.
 * 옵션은 여기 없다 — 옵션 API로 따로 조회해 캐시를 각각 무효화한다.
 */
export const publicMenuSchema = z.object({
  publicId: z.string().describe("메뉴 고유 ID"),
  name: z.string().describe("메뉴 이름"),
  price: z.number().describe("가격"),
  description: z.string().nullable().describe("메뉴 설명"),
  // imageKey(S3 object key)는 응답에 나가지 않는다. 서버가 CDN_BASE_URL과 합쳐
  // 완성된 URL만 내려주므로 버킷 구조를 바꿔도 프론트 배포가 필요 없다.
  images: menuImagesSchema
    .nullable()
    .describe("슬롯별 이미지 URL. 이미지 미등록 시 null"),
  isAvailable: z.boolean().describe("판매 가능 여부"),
  categoryId: z.bigint().describe("메뉴가 속한 카테고리 ID"),
  sortOrder: z.number().describe("카테고리 내 정렬 순서"),
  createdAt: isoDateTime().describe("생성일"),
  updatedAt: isoDateTime().describe("수정일"),
  deletedAt: isoDateTime()
    .nullable()
    .describe(
      "소프트 삭제 시각. 일반 조회는 삭제된 메뉴를 거르므로 항상 null이고, " +
        "복구 목록(`GET /menus/deleted`)에서만 값이 실린다."
    ),
}) satisfies z.ZodType<Menu, z.ZodTypeDef, unknown>;

/** 고객 메뉴판용. 주문 화면을 한 번에 그려야 하므로 옵션까지 실어 내려준다. */
export const publicMenuWithOptionsSchema = publicMenuSchema.extend({
  options: z
    .array(publicMenuOptionGroupSchema)
    .describe("옵션 그룹 목록. 옵션이 없으면 빈 배열이다."),
}) satisfies z.ZodType<MenuWithOptions, z.ZodTypeDef, unknown>;
