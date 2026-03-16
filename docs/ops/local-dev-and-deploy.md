# Local Dev and Deploy

## Component Breakdown

- Local dependencies: Bun, Docker, Postgres container.
- Runtime services:
  - Web (`apps/web`)
  - Worker (`apps/worker`)
- Optional single-container mode (`Dockerfile.single`, compose profile `single`).

## Sequence

1. Configure env from `.env.example`.
2. Install dependencies (`bun install`).
3. Start Postgres and services (`docker compose up --build`).
4. Apply migrations (`bun run db:migrate`).
5. Verify health endpoint and UI routes.

## Failure Modes

- Database unreachable due container startup failure.
- Worker not started, causing stale queue/sync.
- Incorrect `APP_ORIGIN` or OAuth redirect URI mismatch.
- Missing/invalid secrets key causing encryption/decryption failures.

## Operational Commands and Checks

- Install: `bun install`
- Infra: `docker compose up --build`
- Migrate: `bun run db:migrate`
- Web only: `bun run dev:web`
- Worker only: `bun run dev:worker`
- Health check: `curl http://localhost:3000/health`
- Single container profile: `docker compose --profile single up app`

Related docs: [Getting Started](../user-guide/getting-started.md), [Environment Reference](../reference/environment.generated.md).
