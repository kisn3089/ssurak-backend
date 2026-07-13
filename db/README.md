# @ssurak/db

ssurak 백엔드의 데이터베이스 SSOT(Single Source of Truth) 패키지.
Prisma 스키마·마이그레이션·시드와 생성된 타입, 도메인 상수를 한곳에서 관리합니다.

## SSOT 전략

- **Single Schema**: 모든 모델은 `prisma/schema.prisma`에 정의
- **Shared Types**: Prisma 생성 타입을 re-export하여 API가 동일 타입 사용
- **Centralized Migrations**: 마이그레이션·시드를 이 패키지에서 관리

단, 외부(API 응답)로 나가는 계약 타입은 이 패키지가 아니라 `@ssurak/schema`의 response 스키마가 담당합니다.

## 사용법

```json
{
  "dependencies": {
    "@ssurak/db": "workspace:*"
  }
}
```

```typescript
import { PrismaClient, Owner, AdminRole, OrderStatus } from "@ssurak/db";
import { COOKIE_TABLE } from "@ssurak/db/constants";
```

## 개발 명령 (레포 루트에서)

```bash
pnpm --filter @ssurak/db prisma:generate   # Prisma Client 생성 (스키마 변경 후 필수)
pnpm --filter @ssurak/db prisma:migrate    # 마이그레이션 생성/적용 (dev)
pnpm --filter @ssurak/db prisma:deploy     # 적용만 (migrate deploy)
pnpm --filter @ssurak/db prisma:seed       # 시드 (upsert 기반, 멱등)
pnpm --filter @ssurak/db prisma:reset      # DB 리셋
pnpm --filter @ssurak/db prisma:studio     # Prisma Studio
```

## 패키지 구조

```text
db/
├── prisma/
│   ├── schema.prisma          # 데이터베이스 스키마
│   ├── migrations/            # 마이그레이션 히스토리
│   ├── seed.ts                # 시드 스크립트 (tsx로 실행)
│   └── data/                  # 시드 데이터 정의
├── constants/                 # 도메인 상수 (COOKIE_TABLE 등)
├── types/                     # 보조 타입 (PrismaJson 등)
├── init/                      # MySQL 컨테이너 초기화 스크립트 (권한 grant)
├── index.ts                   # PrismaClient·타입·상수 re-export
├── Dockerfile                 # MySQL 이미지 (init 스크립트 포함)
└── studio.Dockerfile          # Prisma Studio / migrate+seed 이미지
```

## 환경변수 (SSOT)

레포 루트 `.env`가 유일한 소스입니다. 이 패키지는 자체 `.env`를 갖지 않고,
스크립트가 `dotenv -e ../.env`로 루트 파일을 읽습니다.

- `DATABASE_URL` — MySQL 연결 문자열 (호스트 실행용, `localhost:3306`)
- `DB_ROOT_PASSWORD`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — compose가 MySQL 컨테이너 초기화에 사용

컨테이너 안에서는 compose의 `environment:`가 `DATABASE_URL`을 `mysql://…@mysql:3306/…`으로 덮어씁니다.
자세한 배치 규칙은 [README.docker.md](../README.docker.md) 참고.

> **주의**: MySQL 컨테이너는 볼륨이 빈 최초 1회에만 유저/DB 생성과 `init/` 스크립트를 실행합니다.
> `.env`의 DB 계정 값을 바꾸면 `docker compose -f docker-compose.dev.yml down -v` 후 재기동해야 합니다.
