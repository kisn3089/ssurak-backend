import type { MenuImages } from "@ssurak/schema";
import { MENU_VARIANT_NAMES } from "src/storage/image-variants";

/**
 * DB의 `imageKey`(variant·확장자를 뺀 prefix)와 CDN 베이스를 합쳐
 * 슬롯별 완성 URL을 만든다.
 */
export function buildMenuImageUrls(
  imageKey: string | null,
  cdnBaseUrl: string
): MenuImages | null {
  if (!imageKey) return null;

  const base = cdnBaseUrl.replace(/\/$/, "");
  const entries = MENU_VARIANT_NAMES.map((variant) => [
    variant,
    `${base}/${imageKey}/${variant}.webp`,
  ]);

  return Object.fromEntries(entries);
}
