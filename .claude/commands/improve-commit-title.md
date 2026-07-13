---
description: 커밋 diff를 분석하여 커밋 메시지 개선안 제시 및 rebase 가이드 제공
allowed-tools: Bash(git:*), Read
argument-hint: [start-commit-hash]
---

# Improve Commit Title

커밋의 diff를 분석하여 더 명확하고 구체적인 커밋 메시지를 제안합니다.

## 실행 단계

### 1. 분석 범위 결정

- `$ARGUMENTS` 인자가 있으면: 해당 커밋부터 HEAD까지 분석
- 인자가 없으면: `origin/main` 브랜치 분기점부터 HEAD까지 분석

```bash
# 인자가 있는 경우
git log <start-commit>^..HEAD --oneline

# 인자가 없는 경우
git log origin/main..HEAD --oneline
```

### 2. 각 커밋 분석

각 커밋에 대해 다음 정보를 수집합니다:

```bash
# 커밋 목록 (오래된 순서대로)
git rev-list --reverse <start>..HEAD

# 각 커밋의 diff
git show <commit-hash> --stat
git show <commit-hash> --no-stat -p
```

### 3. 커밋 메시지 개선 원칙

**커밋 prefix 규칙:**

| Prefix      | 사용 시점                     |
| ----------- | ----------------------------- |
| `feat:`     | 새로운 기능 추가              |
| `fix:`      | 버그 수정                     |
| `refactor:` | 기능 변경 없는 코드 구조 개선 |
| `ui:`       | UI/UX 관련 변경               |
| `style:`    | 코드 포맷팅, 세미콜론 누락 등 |
| `docs:`     | 문서 변경                     |
| `test:`     | 테스트 코드 추가/수정         |
| `perf:`     | 성능 개선                     |
| `chore:`    | 빌드, 패키지 등 기타 변경     |
| `lint:`     | 린트 규칙 적용, 포맷팅        |

**Scope 규칙 (선택사항):**

- `ssurak-api/` 변경 → `ssurak-api/`
- `db/` 변경 → `db/`
- `packages/schema/` 변경 → `schema/`
- Docker/compose 변경 → `docker/`

**커밋 메시지 형식:**

```
<prefix>/<scope>: <설명>

또는

<prefix>: <설명>
```

**좋은 커밋 메시지 예시:**

| 변경 내용    | 나쁜 예           | 좋은 예                                                                           |
| ------------ | ----------------- | --------------------------------------------------------------------------------- |
| 직렬화 전환  | `fix: 수정`       | `ssurak-api/refactor: ClassSerializerInterceptor 제거 후 Dto.schema.parse로 전환` |
| 스키마 추가  | `feat: 타입 추가` | `schema/feat: publicSessionWithTableSchema 추가로 세션 목록 응답 계약 명세`       |
| 마이그레이션 | `chore: db 변경`  | `db/feat: TableSession에 paidAmount 컬럼 추가 마이그레이션`                       |
| 가드 버그    | `fix: 버그 수정`  | `ssurak-api/fix: StoreAccessGuard에서 admin role 우회 조건 오류 수정`             |

### 4. 개선이 필요한 커밋 필터링

**개선이 필요한 커밋 기준:**

다음 조건 중 하나라도 해당하면 개선 대상:

- 설명이 너무 짧거나 모호함 (예: `fix: 수정`, `feat: 추가`, `refactor: 변경`)
- scope가 없음 (예: `fix: 버그 수정` → `ssurak-api/fix: ...`)
- diff 내용과 메시지가 불일치
- 구체적인 변경 내용이 드러나지 않음

**개선이 필요 없는 커밋:**

다음 조건을 모두 충족하면 스킵:

- scope/prefix 형식을 따름
- 변경 내용이 구체적으로 명시됨
- diff와 메시지가 일치함

예: `ssurak-api/fix: StoreAccessGuard에서 admin role 우회 조건 오류 수정` → 스킵

### 5. 출력 형식

**개선이 필요한 커밋만 출력:**

```markdown
## 커밋 메시지 개선안

> 총 5개 커밋 중 2개 개선 필요

| #   | 커밋      | 현재 메시지 | 개선된 메시지                                                          |
| --- | --------- | ----------- | ---------------------------------------------------------------------- |
| 1   | `abc1234` | fix: 수정   | `ssurak-api/fix: 세션 만료 검사에서 timezone 미반영 오류 수정`         |
| 2   | `def5678` | feat: 추가  | `schema/feat: publicOrderSchema에 idempotencyKey 필드 추가`            |
```

**모든 커밋이 양호한 경우:**

```markdown
## 커밋 메시지 분석 결과

> 총 5개 커밋 분석 완료 - 모든 커밋 메시지가 양호합니다 ✓
```

**적용 방법 안내:**

```markdown
## 적용 방법

### 방법 1: Interactive Rebase (권장)

1. rebase 시작:
   \`\`\`bash
   git rebase -i <start-commit>^
   \`\`\`

2. 에디터에서 변경할 커밋의 `pick` → `reword` (또는 `r`)로 변경:
   \`\`\`
   r abc1234 fix: 수정
   r def5678 feat: 추가
   \`\`\`

3. 저장 후 각 커밋에서 새 메시지 입력

### 방법 2: 단일 커밋 (마지막 커밋만)

\`\`\`bash
git commit --amend -m "새로운 커밋 메시지"
\`\`\`
```

**주의사항:**

```markdown
## ⚠️ 주의사항

- `reword`(r)만 사용하세요. `squash`(s), `fixup`(f), `drop`(d)는 커밋 히스토리를 변경합니다.
- 이미 push된 커밋을 rebase하면 `git push --force`가 필요합니다.
- 팀과 공유된 브랜치에서는 신중하게 사용하세요.
```

### 6. 출력

1. 분석 요약 (총 커밋 수, 개선 필요 커밋 수)
2. 개선이 필요한 커밋만 테이블로 출력
3. `git rebase -i` 적용 가이드 (개선 필요한 커밋이 있는 경우만)
4. 주의사항

출력은 마크다운 형식으로 복사하기 쉽게 제공합니다.
