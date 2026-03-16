# Sync, Jobs, and Worker

The worker drives inbox freshness and executes queued provider mutations.

## Component Breakdown

- Worker loop entrypoint: `apps/worker/src/index.ts`
- Job execution: `apps/worker/src/job-handlers.ts`
- Sync delta persistence: `apps/worker/src/sync.ts`
- Provider/account context loading: `apps/worker/src/provider-context.ts`
- Queue/state persistence: `packages/db/src/repositories/app-repository.ts`

## Sequence

1. Web route enqueues job (example: `gmail.incrementalSync`, mutation jobs, reminders).
2. Worker polls due jobs (`WORKER_POLL_MS`) and sync scheduling (`SYNC_POLL_MS`).
3. Worker refreshes token if near expiry.
4. Worker executes provider call and applies state changes.
5. On success, job completes and account status clears to healthy state.
6. On failure, retry/backoff/dead-letter behavior applies based on error classification.

## Failure Modes

- Auth revoked/expired: account transitions to `needs_reauth`.
- Rate limits: account transitions to `rate_limited` with backoff metadata.
- Stale incremental cursor: worker queues partial resync.
- Worker down: pending jobs accumulate and UI state appears stale.

## Operational Commands and Checks

- Start worker: `bun run dev:worker`
- Trigger manual sync from API:
  - `POST /api/sync/refresh`
- Inspect queue and failures in diagnostics UI.
- Inspect worker logs for `worker.batch_error` and `worker.sync_schedule_error`.

Related docs: [Diagnostics and Recovery](../user-guide/diagnostics-and-recovery.md), [Data Model Reference](../reference/data-model.generated.md).
