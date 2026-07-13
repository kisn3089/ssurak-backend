# Docker Setup Guide

ssurak 백엔드 모노레포(`db`, `packages/schema`, `ssurak-api`)의 Docker 실행 가이드.

## 스택 구성

| 파일                     | 용도                              | 프로젝트명   |
| ------------------------ | --------------------------------- | ------------ |
| `docker-compose.dev.yml` | 로컬 개발 (핫리로드)              | `ssurak-dev` |
| `docker-compose.yml`     | 운영 — 홈서버 + Cloudflare Tunnel | `ssurak`     |

> 프로젝트명을 compose 파일에 `name:` 으로 고정해 두었다. 기본값(디렉토리명)을 쓰면
> 같은 디렉토리명의 다른 레포와 볼륨/네트워크를 공유하는 사고가 나므로 지우지 말 것.

### 개발 스택 서비스 (docker-compose.dev.yml)

1. **mysql** — MySQL 8.0 (`db/Dockerfile`, `127.0.0.1:3306`)
2. **redis** — Redis 7 (`127.0.0.1:6379`)
3. **ssurak** — NestJS API, `development` 타깃. 소스를 bind mount 하고
   nodemon + vite-node 로 핫리로드 (`127.0.0.1:${SERVER_PORT}`)
4. **prisma-studio** — DB GUI (`db/studio.Dockerfile`, `127.0.0.1:5555`)

프론트엔드(order/console)는 이 레포에 없으므로 호스트에서 따로 실행한다.

### 운영 스택 서비스 (docker-compose.yml)

1. **mysql** / **redis** — 내구성 우선 설정, 공개 포트 없음
2. **migrate** — `prisma migrate deploy` + `seed.ts`(upsert 기반 멱등) 1회 실행 후
   종료 (`db/studio.Dockerfile` 의 migrate 타깃)
3. **ssurak** — `production` 타깃. `vite build` 번들(`dist/main.mjs`)을 순수
   `node` 로 실행. devDependencies 없음, `USER node`
4. **cloudflared** — 공개 진입점 (api 도메인 → 터널 → `ssurak:8080`)

## 이미지 빌드 구조 (ssurak-api/Dockerfile)

```text
base ── deps(pnpm install) ── source(COPY + prisma generate)
                                ├─ development  CMD pnpm dev        # nodemon + vite-node
                                └─ build        pnpm build + prod 설치
                                     └─ production  CMD node dist/main.mjs
```

- `pnpm build` = `nest build`(SWC 타입체크) + `vite build`(SSR 번들).
  `@ssurak/db`·`@ssurak/schema` 같은 TS 워크스페이스 패키지는 번들에 인라인되고,
  node_modules 의존성(@prisma/client 등)은 externalize 된다.
- production 스테이지는 트랜스파일러가 없으므로 ECR/ECS 로 그대로 배포 가능하다.

## Quick Start

```bash
cp .env.example .env   # 값 채우기

# 개발
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml logs -f ssurak

# 운영 (홈서버)
docker compose up -d --build

# 정지 (볼륨 유지)
docker compose -f docker-compose.dev.yml down
```

## 환경변수 배치 규칙

`${VAR}` 보간은 compose 가 리포 루트 `.env` 를 자동으로 읽어 처리한다.
`env_file:` 은 그와 별개로 컨테이너 안에 변수를 주입하는 기능이며,
**시크릿이 필요한 ssurak 서비스에만** 걸려 있다.

| 변수                                                                          | 위치                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `DB_*`, `REDIS_PASSWORD`, `SERVER_PORT`, `CLOUDFLARE_TUNNEL_TOKEN`            | `.env` → compose 보간                                        |
| `NODE_ENV`, `PORT`, `REDIS_HOST`, 컨테이너용 `DATABASE_URL`(호스트명 `mysql`) | compose `environment:` 블록                                  |
| `JWT_*`, `REDIS_PASSWORD`                                                     | `.env` → ssurak 서비스 `env_file`                            |
| `ORDER_APP_URL`, `CONSOLE_APP_URL`, `COOKIE_DOMAIN`                           | dev 는 `environment:` 에 localhost 하드코딩, prod 는 `.env`  |
| 호스트용 `DATABASE_URL`(호스트명 `localhost`)                                 | `.env` — `db` 패키지의 `dotenv -e ../.env` prisma 스크립트용 |

`environment:` 값이 `env_file` 값보다 우선하고, 앱(ConfigModule `envFilePath: ../.env`)에서는
process.env 가 .env 파일보다 우선한다. `.env` 는 `.dockerignore` 에 있어 이미지에 구워지지 않는다.

## Prisma 워크플로우

```bash
# 호스트에서 (dev mysql 컨테이너가 떠 있는 상태)
pnpm --filter @ssurak/db prisma:generate
pnpm --filter @ssurak/db prisma:migrate     # 새 마이그레이션 생성
pnpm --filter @ssurak/db prisma:seed

# 운영은 migrate 서비스가 up 시 자동으로 migrate deploy + seed 실행
```

MySQL 직접 접속: `mysql -h 127.0.0.1 -P 3306 -u $DB_USER -p $DB_NAME`

## Troubleshooting

- **컨테이너 상태**: `docker compose -f docker-compose.dev.yml ps`
  (mysql/redis 는 healthcheck, prod ssurak 은 `GET /` healthcheck)
- **네이티브 모듈 오류(bcrypt, @swc/core 등)**: dev compose 는 워크스페이스의 모든
  `node_modules` 를 익명 볼륨으로 가려 호스트(macOS) 바이너리가 리눅스 컨테이너를
  오염시키지 않게 한다. 의존성 변경 후에는 이미지 리빌드 + 볼륨 재생성:
  `docker compose -f docker-compose.dev.yml up -d --build -V ssurak`
- **캐시 없이 재빌드**: `docker compose -f docker-compose.dev.yml build --no-cache`

## 파일 구조

```text
.
├── docker-compose.yml           # 운영 스택 (name: ssurak)
├── docker-compose.dev.yml       # 개발 스택 (name: ssurak-dev)
├── .env / .env.example
├── db/
│   ├── Dockerfile               # MySQL (init 스크립트 포함)
│   ├── studio.Dockerfile        # Prisma Studio / migrate+seed
│   ├── init/                    # MySQL 초기화 스크립트
│   └── prisma/schema.prisma
├── packages/schema/             # zod 스키마 (TS, 번들에 인라인)
└── ssurak-api/
    └── Dockerfile               # NestJS API (development/build/production)
```
