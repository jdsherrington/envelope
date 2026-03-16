# FAQ and Troubleshooting

## Preconditions

- You have access to terminal, app logs, and diagnostics page.
- You can run local commands in repository root.

## Step-by-Step Procedure

1. Confirm service health:
   - `curl http://localhost:3000/health`
2. Check DB and worker process status.
3. Inspect diagnostics page for account status and job failures.
4. Verify environment variables match expected values in [Environment Reference](../reference/environment.generated.md).
5. Re-run migrations when schema/runtime mismatch is suspected:
   - `bun run db:migrate`
6. Regenerate docs if local reference appears outdated:
   - `bun run docs:generate`

## Expected Outcome

- You can isolate issues into config, auth, sync/queue, or provider integration categories.
- You can confirm whether failure is transient (retry) or structural (configuration/code).

## Failure Symptoms and Recovery

- Symptom: app boots but routes fail with server errors.
  - Recovery: verify required env vars and DB schema migration state.
- Symptom: OAuth works but sync never progresses.
  - Recovery: confirm worker is running and check queue entries in diagnostics.
- Symptom: command palette actions queue but state never updates.
  - Recovery: inspect worker logs and failed jobs; retry dead jobs after fixing root cause.
- Symptom: docs check fails in CI.
  - Recovery: run `bun run docs:generate` and commit generated changes.
