# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
# 버전은 루트 package.json 의 packageManager 필드를 따른다.
RUN corepack enable
WORKDIR /app


FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY db/package.json ./db/
COPY ssurak-api/package.json ./ssurak-api/
COPY packages/schema/package.json ./packages/schema/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# 소스 + Prisma Client. dev/prod 공통 베이스.
FROM deps AS source
COPY . .
RUN pnpm --filter @ssurak/db exec prisma generate
WORKDIR /app/ssurak-api
EXPOSE 8080

FROM source AS development
ENV NODE_ENV=development
CMD ["pnpm", "dev"]

# 빌드: nest build(SWC 타입체크) 후 vite build 로 @ssurak/* 워크스페이스 TS를
# 인라인한 단일 ESM 번들(dist/main.mjs)을 생성한다. 이후 devDependencies 를
# 제거해 런타임 트리(@prisma/client 생성물 포함)만 남긴다.
FROM source AS build
RUN pnpm --filter @ssurak/ssurak-api build \
 && pnpm install --frozen-lockfile --prod

# 런타임: 번들(dist) + prod node_modules 만 복사. 소스 트리는 제외한다.
# @ssurak/* 워크스페이스 코드는 번들에 인라인되어 있으므로
# node_modules 안의 워크스페이스 심링크가 끊겨도 런타임에 참조되지 않는다.
FROM base AS production
ENV NODE_ENV=production \
    PORT=8080
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/ssurak-api/node_modules /app/ssurak-api/node_modules
COPY --from=build --chown=node:node /app/ssurak-api/package.json /app/ssurak-api/package.json
COPY --from=build --chown=node:node /app/ssurak-api/dist /app/ssurak-api/dist
USER node
WORKDIR /app/ssurak-api
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/main.mjs"]
