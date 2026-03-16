# Diagnostics and Recovery

Diagnostics provides account health, queue visibility, command telemetry, and logs.

## Preconditions

- You are authenticated.
- You have at least one account or jobs/logs to inspect.
- Worker is expected to be running for queue progress.

## Step-by-Step Procedure

1. Open `/diagnostics`.
2. Review **Account Health** for:
   - Status
   - Last sync
   - Quota/backoff
   - Sync progress
   - Failed job count
3. Use account recovery actions:
   - Reconnect
   - Retry sync
   - Remove account
4. Review **Queue** table for failed/dead jobs and trigger retry where supported.
5. Review **Command Events** to diagnose UI action failures.
6. Review **Logs** for scope and error patterns.
7. Export full diagnostics snapshot with `/api/diagnostics/export`.

## Expected Outcome

- You can identify whether failures are auth, quota/rate-limit, or worker/queue related.
- Recovery actions enqueue corrective jobs and update account state.
- Export endpoint returns structured diagnostics payload for offline investigation.

## Failure Symptoms and Recovery

- Symptom: account stuck in `rate_limited`.
  - Recovery: wait until backoff expires, then use retry sync.
- Symptom: repeated dead jobs.
  - Recovery: inspect last error code/message, fix root cause, retry from diagnostics.
- Symptom: no worker heartbeat/queue movement.
  - Recovery: restart worker process and validate database connectivity.

Next: [FAQ and Troubleshooting](./faq-troubleshooting.md).
