export interface VariantSpec {
  width: number;
  height: number;
  quality: number;
}

/**
 * 메뉴 이미지 변형 규격. UI 슬롯 실측 기준이다.
 *
 * - hero: 메뉴 상세 히어로. CSS 폭 약 390px에 4:3 → 2x인 780x585.
 * - thumbnail: 메뉴 리스트 썸네일. CSS 80px 정사각 → 3x인 240x240.
 *
 * 모바일이라고 작게 잡으면 안 된다. 요즘 기기는 DPR이 2~3이라
 * 필요한 실제 픽셀은 CSS 폭의 2~3배다.
 */
export const MENU_VARIANTS = {
  hero: { width: 780, height: 585, quality: 80 },
  thumbnail: { width: 240, height: 240, quality: 78 },
} as const satisfies Record<string, VariantSpec>;

export type MenuVariant = keyof typeof MENU_VARIANTS;

export const MENU_VARIANT_NAMES = Object.keys(MENU_VARIANTS) as MenuVariant[];

/**
 * 업로드를 거절할 최소 원본 가로 폭.
 * hero(780)보다 작은 원본은 확대하지 않으므로(withoutEnlargement) 규격 미달로 저장되고,
 * URL은 정상인데 실제 이미지만 흐린 상태가 된다. 그 전에 막는다.
 */
export const MIN_SOURCE_WIDTH = 400;
