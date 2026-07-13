import z from "zod";

/**
 * 응답 날짜 필드.
 * Prisma 엔티티의 `Date`와 캐시(Redis)에서 복원된 ISO 문자열을 모두 받아
 * ISO 8601 문자열로 정규화한다. 응답 스키마의 출력 타입이 문자열이 되므로
 * 타입 계약(types/)의 직렬화된 뷰와 일치한다.
 */
export const isoDateTime = () =>
  z.preprocess(
    (value) => (value instanceof Date ? value.toISOString() : value),
    z.string().datetime({ offset: true })
  );
