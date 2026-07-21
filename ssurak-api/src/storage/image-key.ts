import { isCuid } from "@paralleldrive/cuid2";

const TMP_PREFIX = "tmp";
const MENU_PREFIX = "menu";

/** 업로드 직후의 임시 prefix. lifecycle 규칙이 하루 뒤 정리한다. */
export const tmpPrefixOf = (ownerPublicId: string, id: string): string =>
  `${TMP_PREFIX}/${ownerPublicId}/${id}`;

/** 메뉴에 확정된 정식 prefix. DB의 `imageKey`에 저장되는 값. */
export const menuPrefixOf = (id: string): string => `${MENU_PREFIX}/${id}`;

export const objectKeyOf = (prefix: string, variant: string): string =>
  `${prefix}/${variant}.webp`;

/**
 * 클라이언트가 보낸 임시 키가 요청자 본인의 것인지 검증한다.
 *
 * 이 검사가 없으면 남의 `tmp/{ownerId}/...`를 그대로 보내 타인이 올린 이미지를
 * 자기 메뉴에 붙이거나, 임의 문자열로 CopyObject의 소스를 조작할 수 있다.
 * 정규식 대신 세그먼트를 분해해 각각 확인하는 이유는 ".."이나 인코딩된
 * 경로 이스케이프가 부분 일치로 통과하는 걸 원천 차단하기 위해서다.
 *
 * @returns 검증에 통과하면 이미지 id, 아니면 null
 */
export function parseOwnedTmpPrefix(
  raw: string,
  ownerPublicId: string
): { id: string } | null {
  const parts = raw.split("/");
  if (parts.length !== 3) return null;

  const [prefix, owner, id] = parts;
  if (prefix !== TMP_PREFIX) return null;
  if (owner !== ownerPublicId) return null;
  if (!isCuid(id)) return null;

  return { id };
}
