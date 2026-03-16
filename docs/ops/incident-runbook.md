# Incident Runbook

Use this when users report broken inbox behavior, sync stalls, auth problems, or degraded health.

## Component Breakdown

- User-facing health: `/health`, `/diagnostics`
- Job execution: worker process + jobs table
- Provider state: account status, quota events, OAuth validity

## Sequence

1. Confirm availability:
   - `GET /health`
2. Check diagnostics page:
   - account status, queue failures, command errors, logs
3. Classify incident:
   - auth/session
   - OAuth/provider
   - quota/rate limit
   - worker/queue
   - DB/runtime
4. Apply first recovery action:
   - reconnect account
   - retry dead/failed jobs
   - restart worker
   - fix env/config and redeploy
5. Re-validate:
   - sync progress resumes
   - account status returns to healthy
   - user action succeeds

## Failure Modes

- Persistent `needs_reauth` after reconnect.
- Repeating dead-letter jobs with same provider error.
- Worker heartbeat missing while web remains healthy.
- Health endpoint degraded due DB outage.

## Operational Commands and Checks

- Health endpoint:
  - `curl http://localhost:3000/health`
- Restart compose services:
  - `docker compose restart web worker`
- Inspect DB migrations state:
  - `bun run db:migrate`
- Export diagnostics snapshot:
  - `GET /api/diagnostics/export`

Escalate when:

- same failure repeats after reconnect/retry and restart,
- data consistency concerns appear in thread/message rendering,
- or provider auth/quota policy changes block normal operation.
