# ssurak backend

테이블 오더(매장 주문) 서비스 **ssurak의 백엔드 모노레포**입니다.
프론트엔드(고객용 order, 점주용 console)는 별도 레포에서 개발되어 Vercel에 배포되며, 이 레포는 API 서버와 데이터베이스 계층만 포함합니다.

**구체적인 아키텍처 다이어그램은 프론트엔드 레포를 확인해주세요.**

Repository: https://github.com/kisn3089/ssurak-frontend

## 구성

```text
.
├── db/                  # @ssurak/db — Prisma 스키마·마이그레이션·시드 (SSOT)
├── packages/schema/     # @ssurak/schema — zod 스키마 (요청 검증 + 응답 계약)
├── ssurak-api/          # @ssurak/ssurak-api — NestJS 11 API 서버
├── docker-compose.dev.yml   # 로컬 개발 스택 (mysql, redis, api, prisma studio)
├── docker-compose.yml       # 운영 스택 (홈서버 + Cloudflare Tunnel)
└── scripts/start_all.sh     # 개발 환경 원클릭 기동
```

**스택**: Node 22 · pnpm 9 · TypeScript 6 · NestJS 11 · Prisma 6 (MySQL) · Redis · Socket.IO · zod/nestjs-zod · vitest

## Quick Start

```bash
# 0. 준비: Docker, pnpm 9 (corepack enable)
cp .env.example .env        # 값 채우기

# 1. 의존성 설치 + Prisma Client 생성
pnpm install
pnpm db:generate

# 2. 개발 인프라 기동 (mysql, redis, api, prisma studio)
docker compose -f docker-compose.dev.yml up -d

# 3. 마이그레이션 + 시드 (최초 1회)
pnpm --filter @ssurak/db prisma:deploy
pnpm --filter @ssurak/db prisma:seed
```

또는 위 과정을 한 번에: `./scripts/start_all.sh`

| 서비스        | URL                          |
| ------------- | ---------------------------- |
| API           | <http://localhost:8080>      |
| Swagger 문서  | <http://localhost:8080/docs> |
| Prisma Studio | <http://localhost:5555>      |

API를 호스트에서 직접 돌리려면(도커 없이 mysql/redis만 도커): `pnpm api:dev`

## 주요 명령

```bash
pnpm api:dev                                  # API dev 서버 (nodemon + vite-node)
pnpm build                                    # db generate + API 타입체크·번들
pnpm --filter @ssurak/ssurak-api test         # vitest 단위 테스트
pnpm --filter @ssurak/ssurak-api test:e2e     # e2e 테스트
pnpm --filter @ssurak/db prisma:migrate       # 새 마이그레이션 생성
pnpm --filter @ssurak/db prisma:studio        # Prisma Studio (호스트)
pnpm lint / pnpm format                       # 린트 / 포맷
```

## 문서

- [README.docker.md](README.docker.md) — Docker 스택 구조, 환경변수 배치 규칙, 배포, 트러블슈팅
- [AGENTS.md](AGENTS.md) — 코딩 규칙, 실행 방식, 알려진 함정 (AI 에이전트/신규 기여자용)
- [db/README.md](db/README.md) — 데이터베이스 패키지 (SSOT 전략)
