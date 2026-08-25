import type { Prisma } from "@ssurak/db";

/**
 * where.deletedAt에 걸린 날짜 경계를 꺼낸다.
 * Prisma 필터는 `Date | string | DateTimeNullableFilter | null` 유니온이라
 * 단언 없이는 경계를 못 꺼내는데, 단언을 쓰면 서비스가 경계를 빼먹어도
 * 컴파일은 통과하고 테스트만 undefined를 만지며 엉뚱하게 죽는다.
 * 여기서 모양을 확인하고 어긋나면 그 자리에서 실패시킨다.
 */
export const dateBoundOf = (
  filter: Prisma.MenuWhereInput["deletedAt"],
  key: "gte" | "lt"
): Date => {
  const bound =
    filter && typeof filter === "object" && !(filter instanceof Date)
      ? filter[key]
      : undefined;

  if (!(bound instanceof Date)) {
    throw new Error(
      `where.deletedAt.${key}가 Date가 아닙니다: ${JSON.stringify(filter)}`
    );
  }

  return bound;
};
