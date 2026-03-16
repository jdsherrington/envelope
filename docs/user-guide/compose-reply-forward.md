# Compose, Reply, Forward

Compose supports new messages plus reply/reply-all/forward, snippets, send-later, and undo send.

## Preconditions

- You are authenticated.
- A valid account ID is available.
- For reply modes, the source message/thread exists in local store.

## Step-by-Step Procedure

1. Open compose:
   - New message: `/compose?accountId=<id>`
   - Reply: from thread page **Reply**
   - Reply all: from thread page **Reply All**
   - Forward: from thread page **Forward**
2. Fill recipients, subject, body.
3. Optional: insert snippet from snippet selector.
4. Optional: toggle rich text mode.
5. To send now, submit form.
6. To send later, choose a timestamp and submit scheduled send path.
7. If undo is offered, click **Undo send** before expiry.

## Expected Outcome

- Send action enqueues provider job and returns queued status.
- Send-later action stores schedule and queues delayed execution.
- Undo send cancels pending send using undo token before timeout.
- Reply/reply-all/forward prefill subject/body from source message.

## Failure Symptoms and Recovery

- Symptom: request fails with validation error.
  - Recovery: check account ID, recipient format, subject length, and timestamp format.
- Symptom: undo send fails.
  - Recovery: token likely expired or already consumed; re-compose and resend if needed.
- Symptom: scheduled send does not trigger.
  - Recovery: verify worker loop is active and queue job status in diagnostics.

Next: [Threads and Attachments](./threads-attachments.md).
