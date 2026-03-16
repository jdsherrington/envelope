# Envelope

Envelope is a self-hosted, keyboard-first Gmail client.

## Quick Start

1. Copy `.env.example` to `.env` and set secrets.
2. Install dependencies: `bun install`
3. Start services: `docker compose up --build`
4. Run migrations: `bun run db:migrate`
5. Start local dev:
   - Web: `bun run dev:web`
   - Worker: `bun run dev:worker`

## Health Endpoint

- `GET /health` returns runtime health with DB + worker heartbeat checks.
- HTTP status is `200` when healthy and `503` when degraded.

## Documentation

- Full docs index: [`docs/README.md`](./docs/README.md)
- Regenerate generated reference docs: `bun run docs:generate`
- Validate docs freshness and links: `bun run docs:check`

## Single Container Mode (Secondary)

Run one container that hosts both web and worker processes (external Postgres required):

1. Ensure `DATABASE_URL` points to an external/managed Postgres instance.
2. Build and run with compose profile:
   - `docker compose --profile single up app`
3. Verify health:
   - `curl http://localhost:3001/health`

## Workspace Layout

- `apps/web` - Next.js web app + API routes
- `apps/worker` - Bun worker for queue/sync jobs
- `packages/core` - command/provider/action contracts
- `packages/db` - Drizzle schema + repositories
- `packages/providers-gmail` - Gmail adapter
- `packages/security` - encryption/password/totp primitives
- `packages/observability` - structured logging helpers
