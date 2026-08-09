import { HttpException, HttpStatus } from "@nestjs/common";
import type { MenuOptionTrigger } from "@ssurak/schema";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";

type TriggerGraphNode = {
  publicId: string;
  trigger: MenuOptionTrigger | null;
};

/**
 * 이 그룹에 새 트리거를 달았을 때 순환 참조가 생기는지 확인한다.
 *
 * 트리거는 표시 순서와 무관하게 의존성 순서로 평가되므로, 순서 제약 대신 순환만 막으면
 * 된다. 순환이 남으면 주문 검증이 서로를 기다리다 두 그룹 모두 영영 노출되지 않는다.
 *
 * `selfPublicId`가 null이면 아직 저장되지 않은 새 그룹이다 — 아무도 이 그룹을 참조할 수
 * 없으므로 순환이 생길 수 없고, 참조 유효성만 확인하면 된다.
 */
export function assertNoTriggerCycle(
  groups: TriggerGraphNode[],
  selfPublicId: string | null,
  nextTrigger: MenuOptionTrigger
): void {
  if (selfPublicId === null) return;

  const dependenciesOf = new Map(
    groups.map((group) => [
      group.publicId,
      new Set((group.trigger ?? []).map((rule) => rule.optionId)),
    ])
  );
  dependenciesOf.set(
    selfPublicId,
    new Set(nextTrigger.map((rule) => rule.optionId))
  );

  const visited = new Set<string>();
  const stack = new Set<string>();

  const hasCycle = (publicId: string): boolean => {
    if (stack.has(publicId)) return true;
    if (visited.has(publicId)) return false;

    visited.add(publicId);
    stack.add(publicId);

    const reachedCycle = [...(dependenciesOf.get(publicId) ?? [])].some(
      (dependencyId) => hasCycle(dependencyId)
    );

    stack.delete(publicId);
    return reachedCycle;
  };

  // 바뀐 노드에서만 출발하면 충분하다 — 기존 그래프는 이미 비순환이므로
  // 새로 생길 수 있는 순환은 반드시 이 노드를 지난다.
  if (!hasCycle(selfPublicId)) return;

  throw new HttpException(
    exceptionContentsIs("MENU_OPTION_TRIGGER_CYCLE"),
    HttpStatus.BAD_REQUEST
  );
}
