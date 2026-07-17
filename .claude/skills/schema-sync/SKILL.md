---
name: schema-sync
description:
  프론트엔드와 백엔드 저장소에 복제된 Zod 스키마의 동기화 상태를 검사합니다.
  같은 이름의 스키마인데 검증 규칙·에러 메시지·필드 구성이 미묘하게 달라진
  드리프트를 찾아 보고합니다. 양쪽 저장소 어디서 실행해도 동작합니다.
  "스키마 동기화", "schema sync", "스키마 비교" 요청 시 사용하세요.
---

# Zod 스키마 동기화 검사 (frontend ↔ backend)

프론트엔드와 백엔드는 저장소가 분리되어 있고, 요청 payload를 검증하는 Zod 스키마를
**양쪽에 복제**해서 유지합니다 (프론트는 폼 검증, 백엔드는 요청 검증).
한쪽만 수정되면 드리프트가 생기므로, 이 스킬은 두 저장소의 스키마를 짝지어 비교하고
차이를 보고합니다.

> 이 스킬 파일 자체도 양쪽 저장소(`.claude/skills/schema-sync/SKILL.md`)에 복제되어
> 있습니다. 스킬을 수정하면 반대쪽 저장소에도 같은 내용을 복사하세요.

## 현재 저장소 판별과 경로

두 저장소는 형제 디렉터리입니다 (`ssurak/frontend`, `ssurak/backend`).
현재 작업 디렉터리에 어느 경로가 존재하는지로 판별합니다:

- `packages/api/src/schemas/model` 존재 → **frontend에서 실행 중**, 상대편은 `../backend`
- `packages/schema/src/schemas/request` 존재 → **backend에서 실행 중**, 상대편은 `../frontend`

상대편 저장소 디렉터리가 없으면 즉시 중단하고 사용자에게 경로를 물어보세요.

## 파일 매핑

| Frontend 저장소                                     | Backend 저장소                                           |
| --------------------------------------------------- | -------------------------------------------------------- |
| `packages/api/src/schemas/model/<entity>.schema.ts` | `packages/schema/src/schemas/request/<entity>.schema.ts` |
| `packages/api/src/schemas/common.ts`                | `packages/schema/src/schemas/request/common.schema.ts`   |
| `packages/api/src/schemas/signIn.schema.ts`         | `packages/schema/src/schemas/request/signIn.schema.ts`   |

## 검사 절차

1. **인벤토리 대조**: 양쪽 디렉터리의 `*.schema.ts` 파일 목록을 나열하고,
   한쪽에만 존재하는 파일을 먼저 보고합니다 (매핑 테이블의 이름 차이는 정상).

2. **정규화 diff**: 파일 쌍마다 import 문과 주석을 제거한 뒤 비교합니다.

   ```bash
   # 한 줄 /* ... */ 주석은 s 명령으로 먼저 지워야 한다 — sed의 범위 삭제(/\/\*/,/\*\//d)는
   # 끝 패턴을 다음 줄부터 찾기 때문에, 한 줄 주석이 범위 시작으로 매칭되면 다음 */까지의
   # 코드 블록이 통째로 삭제되어 스퓨리어스 DRIFT 또는 (양쪽이 같이 삭제되면) 거짓 IN SYNC가 난다.
   normalize() { grep -v "^import" "$1" | sed -e 's:/\*.*\*/::g' -e 's://.*::' -e '/^[[:space:]]*\/\*/,/\*\//d' -e '/^[[:space:]]*$/d'; }
   diff <(normalize "$FRONT_FILE") <(normalize "$BACK_FILE")
   ```

   diff가 비어 있으면 그 쌍은 **IN SYNC** — 더 볼 필요 없습니다.

3. **드리프트 분석**: diff가 남은 쌍만 양쪽 파일을 실제로 읽고, 차이를 분류합니다.

   **무시해도 되는 차이 (드리프트 아님):**
   - import 경로 (`"../common"` vs `"./common.schema"`, `types/` 상대 깊이)
   - 주석 내용, 공백/포맷팅
   - export 순서
   - 런타임 동작이 같은 표현 차이 — 예: `z.literal(TableSessionStatus.PAYMENT_PENDING)` vs
     `z.literal("PAYMENT_PENDING")`. 상수 참조는 실제 값까지 확인해서 판단하고,
     같으면 "표현만 다름"으로 참고 표기만 하세요.

   **보고해야 하는 드리프트:**
   - 검증 체인 차이: `.min()`/`.max()`/`.regex()`/`.trim()`/`.optional()`/`.nullable()`/`.strict()` 유무나 인자
   - 에러 메시지 문자열 차이
   - 필드 추가/삭제, 필드 타입 차이
   - enum 값 목록 차이
   - `.transform()`/`.refine()` 로직 차이
   - 한쪽에만 존재하는 export (스키마, 타입, params/query 스키마)

4. **방향 판단**: 드리프트가 있는 파일은 양쪽 저장소에서
   `git log -1 --format="%ci %h %s" -- <file>`로 마지막 수정 시점을 확인합니다.
   **더 최근에 수정된 쪽이 의도된 최신본일 가능성이 높습니다.** 이를 근거로
   동기화 방향(front→back 또는 back→front)을 제안하되, 자동으로 수정하지 마세요.

## 출력 형식

파일 쌍별로 요약 테이블을 먼저 제시합니다:

| 파일            | 상태          | 비고                                       |
| --------------- | ------------- | ------------------------------------------ |
| table.schema.ts | ✅ IN SYNC    |                                            |
| menu.schema.ts  | ⚠️ DRIFT      | `.max(50)` vs `.max(30)`, 에러 메시지 상이 |
| owner.schema.ts | ❌ FRONT ONLY | 백엔드에 파일 없음                         |

이어서 DRIFT 항목마다:

- 어떤 export의 어떤 필드가 어떻게 다른지 (양쪽 코드 발췌)
- 양쪽 마지막 커밋 시점과 제안 동기화 방향

## 수정 규칙

- **보고가 기본입니다.** 사용자가 명시적으로 동기화를 요청한 경우에만 수정하세요.
- 수정 시 **현재 실행 중인 저장소의 파일만** 편집합니다. 상대편 저장소 수정이
  필요하면 변경할 내용을 보고만 하고 사용자에게 맡기세요.
- 복사할 때 import 경로는 각 저장소 구조에 맞게 유지합니다 (본문 검증 로직만 동기화).
- 수정 후 해당 스키마 패키지에서 `npx tsc --noEmit`으로 타입 검증합니다
  (frontend는 `packages/api`, backend는 `packages/schema`에서 실행.
  frontend의 `pnpm check-types`는 이 패키지를 검사하지 않음).
