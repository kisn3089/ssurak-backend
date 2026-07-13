# GitHub Copilot Instructions for ssurak backend

## Project Overview

This is the **backend-only pnpm workspace** for ssurak, a restaurant table-ordering service. Frontends (order, console) live in a separate repository and deploy to Vercel — there is **no frontend code here**.

Canonical, more detailed guidance lives in [`AGENTS.md`](../AGENTS.md) and [`README.docker.md`](../README.docker.md). Keep this file and AGENTS.md in sync when the architecture changes.

## Workspace Layout

| Path               | Package              | Purpose                                                                         |
| ------------------ | -------------------- | ------------------------------------------------------------------------------- |
| `db/`              | `@ssurak/db`         | Prisma schema, migrations, seed; re-exports PrismaClient/types/constants (SSOT) |
| `packages/schema/` | `@ssurak/schema`     | zod schemas — request validation + response contracts                           |
| `ssurak-api/`      | `@ssurak/ssurak-api` | NestJS 11 API server (port 8080)                                                |

## Tech Stack

- **pnpm 9** (REQUIRED — never npm or yarn), Node.js 22
- **TypeScript 6** (`strict: true`, module `nodenext`, target `es2024`)
- **NestJS 11** (Express), **Prisma 6** (MySQL), Redis (ioredis), Socket.IO
- **zod 3 + nestjs-zod** for validation/serialization — `class-validator`/`class-transformer` are NOT used
- **vitest** for tests (NOT jest)
- ESLint 9 FlatConfig + Prettier

## Runtime Model

- Dev: `pnpm dev` → nodemon + **vite-node** (runs TS sources directly)
- Build: `pnpm build` → `nest build` (SWC type check) + `vite build` (single ESM bundle `dist/main.mjs`, workspace TS packages inlined)
- Prod: `node dist/main.mjs` — no transpiler at runtime
- **`@prisma/client` must remain a direct dependency of ssurak-api** (vite externalization + runtime resolution depend on it)

## Coding Standards

1. **NEVER use type assertions (`as`)** — use proper type design (generics with defaults, union/intersection types).
2. **Request validation**: `@UseGuards(ZodValidation({ params, body }))` with schemas from `@ssurak/schema`; DTOs derive via `createZodDto`.
3. **Response serialization**: explicit parse at controller return sites — `PublicXxxDto.schema.parse(entity)`. No interceptor/`@Exclude` patterns.
4. **DB types** import only from `@ssurak/db`; outward-facing contracts use `@ssurak/schema` response schemas.
5. Root `.env` is the single source of env config (app: `ConfigModule` with `envFilePath: '../.env'`; Prisma CLI: `dotenv -e ../.env`).
6. Commit messages: `<scope>/<prefix>: description` (scope: `ssurak-api`, `db`, `schema`; prefix: feat/fix/refactor/chore/docs/test). Korean allowed; be specific.
7. Comments only where logic isn't self-evident (Korean or English).
8. Avoid over-engineering; check OWASP top 10 at system boundaries.

## Common Commands

```bash
pnpm api:dev                                  # run API dev server (from root)
pnpm --filter @ssurak/db prisma:generate      # regenerate Prisma Client (after schema changes)
pnpm --filter @ssurak/db prisma:migrate       # create/apply migrations (dev)
pnpm --filter @ssurak/db prisma:seed          # seed (idempotent, upsert-based)
pnpm --filter @ssurak/ssurak-api test         # unit tests (vitest)
pnpm --filter @ssurak/ssurak-api test:e2e     # e2e tests
pnpm --filter @ssurak/ssurak-api build        # type check + deployable bundle
docker compose -f docker-compose.dev.yml up -d  # dev stack: mysql, redis, api, prisma studio
```

## Review Language & Style

- Korean with "존댓말" (formal tone) for code review comments
- Keep technical terms in English; concise sentences; bullet points
