# syntax=docker/dockerfile:1

# Prisma Studio 전용 이미지.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
# 버전은 루트 package.json 의 packageManager 필드를 따른다.
RUN corepack enable
# 워크스페이스 루트를 WORKDIR로 사용 (pnpm-workspace.yaml / pnpm-lock.yaml 기준)
WORKDIR /app

FROM base AS studio
# 워크스페이스 루트 락파일 + 각 패키지 매니페스트로 --frozen-lockfile 성립
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY db/package.json ./db/
COPY ssurak-api/package.json ./ssurak-api/
COPY packages/schema/package.json ./packages/schema/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# 스키마 및 소스 복사 후 Prisma Client 생성
COPY db/ ./db/
WORKDIR /app/db
RUN pnpm exec prisma generate

EXPOSE 5555
# 컨테이너 밖에서 접근해야 하므로 0.0.0.0 에 바인딩한다(포트 매핑은 compose에서 루프백 제한).
CMD ["pnpm", "exec", "prisma", "studio", "--port", "5555", "--browser", "none", "--hostname", "0.0.0.0"]

# 마이그레이션 + 초기 시딩 전용 이미지. studio 스테이지(설치/generate 완료)를 상속해 CMD만 교체한다.
# seed.ts는 upsert 기반이라 재실행해도 안전(멱등).
FROM studio AS migrate
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts"]
