/**
 * 이름 비교용 정규화 키.
 *
 * NFC 정규화가 필요한 이유: 한글은 조합형(NFD)과 완성형(NFC)이 코드포인트가 달라
 * 눈에 같아 보여도 문자열 비교가 어긋난다. 모델 출력과 DB 값의 출처가 다르므로
 * 한쪽으로 모으지 않으면 "찌개류"가 매칭되지 않는 일이 생긴다.
 *
 * 초안 매퍼와 일괄 등록이 반드시 같은 규칙을 써야 한다 — 한쪽만 느슨하면
 * 초안에서 "이미 있는 카테고리"로 접힌 이름이 등록 단계에서 새 카테고리로 갈라진다.
 */
export const normalizeNameKey = (raw: string): string =>
  raw.normalize("NFC").trim().toLowerCase().replace(/\s+/g, "");

/** 저장할 이름. 비교 키와 달리 대소문자·공백은 사장님이 쓴 그대로 둔다. */
export const normalizeNameValue = (raw: string): string =>
  raw.normalize("NFC").trim();
