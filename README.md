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

## Workspace Layout

- `apps/web` - Next.js web app + API routes
- `apps/worker` - Bun worker for queue/sync jobs
- `packages/core` - command/provider/action contracts
- `packages/db` - Drizzle schema + repositories
- `packages/providers-gmail` - Gmail adapter
- `packages/security` - encryption/password/totp primitives
- `packages/observability` - structured logging helpers
