---
description: PR 템플릿 기반으로 git history를 분석하여 PR 설명을 자동 생성
allowed-tools: Bash(git:*), Read
argument-hint: [base-branch]
---

# PR Description Generator

PR 템플릿(`.github/pull_request_template.md`)과 git history를 분석하여 PR 설명을 생성합니다.

## 실행 단계

### 1. PR 템플릿 읽기

`.github/pull_request_template.md` 파일을 읽어 템플릿 구조를 파악합니다.

### 2. Git 컨텍스트 수집

Base branch를 결정합니다:

- `$ARGUMENTS` 인자가 있으면 해당 브랜치 사용
- 없으면 `main` 사용

다음 git 명령어들을 실행하여 컨텍스트를 수집합니다:

```bash
# 현재 브랜치
git branch --show-current

# 커밋 로그 (base branch 이후)
git log <base-branch>..HEAD --pretty=format:"%h %s%n%b---"

# 변경 파일 요약
git diff --stat <base-branch>...HEAD

# 전체 diff
git diff <base-branch>...HEAD
```

### 3. 변경 사항 분석

**변경 유형 감지 (커밋 prefix 기반):**

| Prefix             | 변경 유형                               |
| ------------------ | --------------------------------------- |
| `feat:`, `*/feat:` | ✨ 새로운 기능 (New feature)            |
| `fix:`, `*/fix:`   | 🐛 버그 수정 (Bug fix)                  |
| `refactor:`        | 🎨 코드 리팩토링 (Code refactoring)     |
| `docs:`            | 📚 문서 업데이트 (Documentation update) |
| `test:`            | 🧪 테스트 관련 (Test related)           |
| `perf:`            | ⚡ 성능 개선 (Performance improvement)  |
| `chore:`, `lint:`  | 🔧 설정 변경 (Configuration change)     |
| `docker:`          | 🐳 Docker 관련 (Docker related)         |

**영향 범위 감지 (파일 경로 기반):**

| 경로 패턴                           | 영향 범위                          |
| ----------------------------------- | ---------------------------------- |
| `ssurak-api/`, `packages/schema/`   | 백엔드 API (Backend API)           |
| `db/`, `prisma/`                    | 데이터베이스 (Database)            |
| `docker-compose*.yml`, `Dockerfile` | Docker 설정 (Docker Configuration) |
| 그 외                               | 기타 (Other)                       |

### 4. PR 템플릿 섹션 작성

#### 설명 (Description)

커밋 메시지와 diff를 기반으로 목적과 변경 내용을 요약합니다.

**GitHub 마크다운 포맷팅 규칙:**

1. ### 번호 + 제목으로 주요 변경 사항을 구분
2. **백틱(`)**으로 코드, 컴포넌트명, 파일명, 태그 강조
3. **화살표(→)**로 변경 전/후를 명확하게 표현
4. **불릿 포인트(-)**로 세부 설명 추가

**출력 형식 예시:**

```markdown
### 1. 응답 직렬화를 zod parse로 전환

- `ClassSerializerInterceptor` 제거, 컨트롤러 반환 지점에서 `PublicOwnerDto.schema.parse()` 적용
- `packages/schema`에 `owner.response.ts` 등 response 스키마 12종 추가

### 2. 세션 조회 API 계약 명세 보강

- `GET /stores/{storeId}/sessions` 응답 타입을 `PublicSessionWithTableDto`로 문서화
- `tableSession.docs.ts`의 ApiResponse 타입 불일치 수정

### 3. 타입 안정성 개선

- `updateSessionPayloadSchema`에서 `z.infer`로 DTO 타입 파생
- `any` 타입 → 명시적 타입으로 변경
```

**작성 원칙:**

- 추상적 표현 대신 구체적 기술 내용 작성
  - 나쁜 예: "직렬화 개선"
  - 좋은 예: "`ClassSerializerInterceptor` 제거 후 `Dto.schema.parse()`로 응답 직렬화 전환"
- 실제 변경된 파일, 모듈, 로직을 구체적으로 명시
- 커밋 메시지의 prefix별로 그룹화하여 정리

#### 변경 유형 (Type of Change)

- 감지된 유형만 체크 (`[x]`)로 표시
- 해당하지 않는 유형은 삭제

#### 영향 범위 (Scope)

- 감지된 범위만 체크 (`[x]`)로 표시
- 해당하지 않는 범위는 삭제

#### 테스트 (Testing)

변경 유형에 따른 적절한 테스트 유형 제안:

- Backend 변경: API 테스트, 단위 테스트
- Database 변경: 통합 테스트
- Docker/인프라 변경: 수동 테스트 (스택 기동 확인)

#### 테스트 단계 (Test Steps)

실제 변경 사항 기반 구체적인 테스트 단계 작성:

1. 구체적인 테스트 시나리오
2. 예상 결과
3. 확인 방법

#### 체크리스트 (Checklist)

모든 항목 미체크 상태(`[ ]`)로 유지 (작성자가 확인)

#### 관련 Issue

커밋 메시지에서 issue 참조 추출 (예: "Fixes #123", "Closes #456")

#### API 응답 예시

API 계약(요청/응답 스키마) 변경이 감지되면 Swagger 캡처 또는 응답 예시 추가 안내 문구 작성

#### 데이터베이스 마이그레이션

- `db/prisma/` 변경이 있으면: `[x] 데이터베이스 마이그레이션 필요`
- 없으면: `[x] 데이터베이스 마이그레이션 불필요`

#### 설정 변경 (Configuration Changes)

변경된 설정 파일 명시 (.env, package.json, tsconfig 등)

#### 배포 참고사항 (Deployment Notes)

- DB 마이그레이션 실행 필요 여부
- 환경변수 추가/변경 여부
- 의존성 설치 필요 여부

#### 추가 정보 (Additional Information)

커밋 메시지의 body에서 추가 컨텍스트 추출

### 5. PR 제목 생성

커밋 메시지를 분석하여 PR 제목을 생성합니다.

**제목 작성 규칙:**

1. Conventional Commits 형식 사용: `type(scope): description`
2. 70자 이내로 작성
3. 주요 변경 사항을 간결하게 요약
4. 여러 유형의 변경이 있을 경우 가장 중요한 것을 선택

**유형 우선순위:**

1. `feat` - 새로운 기능이 포함된 경우
2. `fix` - 버그 수정이 주요 목적인 경우
3. `refactor` - 코드 구조 개선이 주요 목적인 경우
4. `chore` - 설정/유지보수 변경인 경우

**scope 결정:**

- 단일 패키지 변경: 해당 패키지명 (예: `ssurak-api`, `db`, `schema`)
- 여러 패키지 변경: 가장 영향이 큰 것 또는 생략

**예시:**

```text
feat(ssurak-api): Owner/Admin 통합 인증 시스템 구축
refactor(ssurak-api): 도메인 기반 모듈 아키텍처 재설계
fix(db): 세션 만료 시각 계산 오류 수정
chore: Docker prod 스테이지를 vite build 번들 실행으로 전환
```

### 6. 출력

**출력 순서:**

1. PR 제목 (## PR 제목)
2. PR 본문 (마크다운 코드 블록으로 감싸서 복사하기 쉽게 제공)
