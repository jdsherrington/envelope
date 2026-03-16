# System Overview

Envelope is a Bun/TypeScript monorepo with a Next.js web app and a polling worker.

## Component Breakdown

- `apps/web`
  - Next.js UI routes and API endpoints.
  - Handles auth/session, command execution, queue enqueue, and diagnostics views.
- `apps/worker`
  - Polls due jobs and periodic sync scheduling.
  - Executes provider operations and writes sync/mutation effects back to DB.
- `packages/db`
  - Drizzle schema + repository methods used by web and worker.
- `packages/core`
  - Command, action, provider, and sync abstractions.
- `packages/providers-gmail`
  - Gmail OAuth, sync, mutation, and attachment adapter.
- `packages/security`
  - Encryption, password hashing, TOTP helpers.
- `packages/observability`
  - Structured logging and command event support.

## Sequence

1. User interacts with UI.
2. UI calls API routes.
3. API routes validate auth/CSRF and store mutations or enqueue jobs.
4. Worker polls and executes jobs against Gmail adapter.
5. Worker persists sync deltas and updates account/job state.
6. UI polls sync progress and reads latest state from DB.

## Failure Modes

- Web unavailable while worker healthy: UI/API failures only.
- Worker unavailable while web healthy: queue grows, sync stalls.
- DB unavailable: both web and worker degrade/fail.
- Provider quota/auth failures: account status transitions to rate-limited or needs-reauth.

## Operational Commands and Checks

- Start stack: `docker compose up --build`
- Run migrations: `bun run db:migrate`
- Web dev: `bun run dev:web`
- Worker dev: `bun run dev:worker`
- Health: `curl http://localhost:3000/health`

Related docs: [Sync, Jobs, and Worker](./sync-jobs-and-worker.md), [Auth and Security](./auth-and-security.md).
