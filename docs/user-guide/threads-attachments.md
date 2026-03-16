# Threads and Attachments

Thread view shows message history, sanitizes HTML, and supports attachment download.

## Preconditions

- You have a valid `threadId` and `accountId`.
- The account belongs to your authenticated user.
- Message data is synced (or can be prefetched).

## Step-by-Step Procedure

1. Open thread page:
   - `/thread/<threadId>?accountId=<accountId>`
2. Review thread metadata, labels, and latest message actions.
3. Use reply/reply-all/forward links to open compose flows.
4. If message body is missing, wait while body prefetch completes.
5. Download attachments from attachment links in each message.

## Expected Outcome

- Thread content renders with sanitized HTML fallback to text/snippet.
- Missing bodies trigger `gmail.prefetchThreadBodies` background job.
- Attachment endpoint serves downloadable content with attachment disposition.

## Failure Symptoms and Recovery

- Symptom: thread returns 404.
  - Recovery: ensure account ID is supplied and belongs to your user.
- Symptom: body remains missing.
  - Recovery: check worker queue and retry sync/prefetch jobs from diagnostics.
- Symptom: attachment download fails.
  - Recovery: confirm `accountId` query parameter is present and the message belongs to that account.

Next: [Settings](./settings.md).
