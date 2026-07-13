# @ssurak/ssurak-api

ssurak의 NestJS 11 API 서버. 요청 검증과 응답 직렬화를 모두 zod(`@ssurak/schema`)로 처리합니다.

## 실행

```bash
# 개발 (nodemon + vite-node 핫리로드) — mysql/redis가 떠 있어야 함
pnpm dev

# 워치 없이 소스 실행
pnpm start

# 타입체크(nest build/SWC) + 배포 번들(vite build → dist/main.mjs)
pnpm build

# 번들 실행 (운영과 동일)
pnpm start:prod
```

- API: <http://localhost:8080> (`GET /` 헬스체크)
- Swagger: <http://localhost:8080/docs>

## 테스트 (vitest)

```bash
pnpm test          # 단위 테스트
pnpm test:watch    # 워치 모드
pnpm test:e2e      # e2e 테스트
pnpm test:all      # 단위 + e2e
```

## 아키텍처 노트

- **검증**: `@UseGuards(ZodValidation({ params, body }))` + `@ssurak/schema`의 request 스키마
- **직렬화**: 컨트롤러 반환 지점에서 `PublicXxxDto.schema.parse(entity)` — 스키마에 없는 필드는 제거되고, 계약 위반은 500으로 드러난다
- **DTO**: `createZodDto(스키마)` 파생 클래스 (`src/dto/request`, `src/dto/response`)
- **번들**: `vite build`(SSR)가 `@ssurak/db`·`@ssurak/schema`를 인라인한 단일 ESM(`dist/main.mjs`)을 생성 — 운영에서는 트랜스파일러 없이 순수 node로 실행. 이 때문에 `@prisma/client`는 이 패키지의 직접 의존성이어야 한다
- **설정**: 루트 `.env`를 `ConfigModule`(`envFilePath: ../.env`)로 읽는다. 컨테이너에서는 compose가 주입한 process.env가 우선

전체 규칙은 [AGENTS.md](../AGENTS.md), Docker 구조는 [README.docker.md](../README.docker.md) 참고.
