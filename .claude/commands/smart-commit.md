---
description: Git 변경 내역을 분석하여 논리적으로 그룹화하고 순차적으로 커밋
allowed-tools: Bash(git:*), Bash(find:*), Bash(ls:*), Read, Glob, Grep, Skill
---

# Smart Commit - Git 변경 내역 분석 및 논리적 커밋 그룹화

현재 git 변경 내역을 분석하여 논리적으로 그룹화하고 순차적으로 커밋합니다.

## 작업 절차

### 1단계: 변경 내역 분석

다음 명령어들을 실행하여 현재 상태를 파악합니다:

- `git status --short` - 변경된 파일 목록 확인
- `git diff --stat HEAD` - 변경 통계 확인
- 새로 추가된 디렉토리가 있다면 `find` 또는 `ls`로 구조 파악

### 1.5단계: 스키마 동기화 검사

변경된 파일에 Zod 스키마(`packages/api/src/schemas/**` 또는
`packages/schema/src/schemas/**`)가 포함되어 있으면, 커밋 그룹화를 제안하기 전에
**Skill 도구로 `schema-sync` 스킬을 호출**하여 상대편 저장소와의 드리프트를 검사합니다.

- 드리프트가 발견되면 결과를 사용자에게 보고하고, 그대로 커밋할지 먼저 동기화할지
  확인을 받습니다.
- 스키마 변경이 없으면 이 단계를 건너뜁니다.

### 2단계: 커밋 그룹화 제안

변경된 파일들을 다음 기준으로 그룹화합니다:

1. **패키지/모듈 단위**: 동일 패키지 내 관련 변경사항
2. **기능 단위**: 특정 기능 구현에 필요한 파일들
3. **계층 단위**: 타입 정의 → API → 서비스 → 컨트롤러 순서
4. **의존성 순서**: 하위 모듈부터 상위 모듈 순으로

각 그룹에 대해 다음을 제안합니다:

- 커밋 메시지 (Conventional Commits 형식)
- 포함될 파일 목록
- 신규/수정/삭제 파일 구분

### 3단계: 사용자 확인

그룹화 제안을 사용자에게 보여주고 확인을 받습니다.

### 4단계: 순차적 커밋 실행

승인된 그룹화에 따라 순차적으로 커밋합니다:

```bash
git add <파일들>
git commit -m "$(cat <<'EOF'
<커밋 메시지>

<상세 설명>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

### 5단계: 결과 확인

`git log --oneline -N`으로 생성된 커밋들을 확인합니다.

## 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**Type 종류:**

- `feat`: 새로운 기능
- `fix`: 버그 수정
- `refactor`: 리팩토링 (기능 변경 없음)
- `chore`: 빌드, 설정 등 기타 변경
- `docs`: 문서 변경
- `test`: 테스트 추가/수정
- `style`: 코드 포맷팅

**Scope 예시:**

- `db`: @ssurak/db 패키지 (Prisma 스키마·마이그레이션·시드)
- `schema`: @ssurak/schema 패키지 (zod 스키마)
- `ssurak-api`: NestJS API 서버
- `docker`: Dockerfile, docker-compose

## 주의사항

1. 삭제된 파일도 `git add`에 포함해야 함
2. 각 커밋은 독립적으로 빌드/테스트 가능해야 함
3. 의존성 순서를 고려하여 하위 모듈부터 커밋
4. 커밋 메시지는 한글 또는 영어로 일관성 유지

## 실행

지금 바로 git 변경 내역을 분석하고 커밋 그룹화를 제안해주세요.
