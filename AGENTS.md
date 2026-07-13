# AGENTS.md

ssurak **백엔드 전용** 레포입니다. 프론트엔드(order, console)는 별도 레포에서 개발되어 Vercel에 배포됩니다 — 이 레포에 프론트 코드는 없습니다.

## 워크스페이스 구조 (pnpm workspaces)

| 경로               | 패키지명             | 역할                                                                     |
| ------------------ | -------------------- | ------------------------------------------------------------------------ |
| `db/`              | `@ssurak/db`         | Prisma 스키마·마이그레이션·시드, PrismaClient/타입/상수 re-export (SSOT) |
| `packages/schema/` | `@ssurak/schema`     | zod 스키마 (request 검증 + response 직렬화 계약)                         |
| `ssurak-api/`      | `@ssurak/ssurak-api` | NestJS 11 API 서버 (포트 8080)                                           |

## 기술 스택

- **런타임**: Node.js 22, pnpm 9 (`packageManager` 필드 준수 — npm/yarn 금지)
- **언어**: TypeScript 6.0.3, `strict: true`, module `nodenext`, target `es2024`
- **프레임워크**: NestJS 11 (Express), Prisma 6 (MySQL), Redis(ioredis), Socket.IO
- **검증/직렬화**: zod 3 + nestjs-zod (`class-validator`/`class-transformer` 사용 안 함)
- **테스트**: vitest (jest 아님)
- **린트**: ESLint 9 FlatConfig + Prettier

## 실행 방식 (중요)

| 모드          | 명령                      | 동작                                                  |
| ------------- | ------------------------- | ----------------------------------------------------- |
| 개발          | `pnpm dev` (ssurak-api)   | nodemon + **vite-node**로 TS 소스 직접 실행           |
| 타입체크+번들 | `pnpm build` (ssurak-api) | `nest build`(SWC 타입체크) → `vite build`(SSR 번들)   |
| 운영          | `pnpm start:prod`         | `node --enable-source-maps dist/main.mjs` (순수 node) |

- `vite build`가 `@ssurak/db`·`@ssurak/schema`(TS 원본 워크스페이스 패키지)를 단일 ESM 번들 `dist/main.mjs`에 인라인한다. 순수 `node`로 dist를 실행할 수 있는 이유가 이것.
- **`@prisma/client`는 ssurak-api의 직접 의존성으로 유지해야 한다.** 제거하면 vite가 externalize하지 못해 번들에 `.prisma/client/default`가 남아 ESM 크래시가 난다.
- 데코레이터 메타데이터(`emitDecoratorMetadata`)는 unplugin-swc가 처리한다 (esbuild 미지원).

## 자주 쓰는 명령

```bash
pnpm install                                  # 루트에서 전체 설치
pnpm api:dev                                  # API dev 서버 (루트에서)
pnpm --filter @ssurak/db prisma:generate      # Prisma Client 생성 (스키마 변경 후 필수)
pnpm --filter @ssurak/db prisma:migrate       # 마이그레이션 생성/적용 (dev)
pnpm --filter @ssurak/db prisma:seed          # 시드 (upsert 기반, 멱등)
pnpm --filter @ssurak/ssurak-api test         # vitest 단위 테스트
pnpm --filter @ssurak/ssurak-api build        # 타입체크 + 배포 번들
docker compose -f docker-compose.dev.yml up -d  # dev 인프라 (mysql/redis/api/studio)
```

Docker 상세(스테이지 구조, 환경변수 배치 규칙, 트러블슈팅)는 [README.docker.md](README.docker.md) 참고.

## 코딩 규칙

1. **타입 단언(`as`) 금지** — 제네릭 기본값, 유니온/교차 타입 등 올바른 타입 설계로 해결한다.
2. **요청 검증**은 `ZodValidation` 가드 (`@UseGuards(ZodValidation({ params, body }))`), DTO는 `packages/schema`의 zod 스키마에서 `createZodDto`로 파생한다.
3. **응답 직렬화**는 컨트롤러 반환 지점에서 명시적 parse: `PublicXxxDto.schema.parse(entity)`. `ClassSerializerInterceptor`/`@Exclude` 패턴은 사용하지 않는다.
4. **DB 타입은 `@ssurak/db`에서만 import** — 단, 외부(API 응답)로 나가는 계약은 `@ssurak/schema`의 response 스키마가 담당한다.
5. 환경변수는 루트 `.env`가 SSOT — 앱은 `ConfigModule`(`envFilePath: ../.env`), Prisma CLI는 `dotenv -e ../.env`로 같은 파일을 읽는다. compose에서의 배치 규칙은 README.docker.md 참고.
6. 커밋 메시지: `<scope>/<prefix>: 설명` (scope: `ssurak-api`, `db`, `schema`; prefix: feat/fix/refactor/chore/docs/test). 커밋 제목은 한글 허용, 구체적으로.
7. 주석은 코드로 드러나지 않는 제약·이유만, 한국어 또는 영어.

## 함정 (known pitfalls)

- MySQL 컨테이너는 볼륨이 빈 최초 1회에만 유저/DB 생성 + `db/init/` 스크립트를 실행한다. `.env`의 DB 계정 값을 바꾸면 `docker compose -f docker-compose.dev.yml down -v` 후 재기동해야 한다.
- compose 프로젝트명은 `name: ssurak` / `ssurak-dev`로 고정되어 있다. 지우면 디렉토리명(`backend`) 기반으로 다른 레포와 볼륨을 공유하는 사고가 난다.
- `prisma migrate deploy`와 seed는 멱등이므로 매 `up`마다 실행돼도 안전하다 (운영 compose의 migrate 서비스).
- prod 이미지의 migrate는 `db/studio.Dockerfile`의 `migrate` 타깃을 쓴다 (production 이미지에는 prisma CLI가 없음).
