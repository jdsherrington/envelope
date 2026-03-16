# Provider Adapter Model

Envelope isolates provider-specific behavior behind `@envelope/core` interfaces with a Gmail implementation.

## Component Breakdown

- Core provider abstractions: `packages/core/src/providers/types.ts`
- Gmail adapter implementation: `packages/providers-gmail/src/adapter.ts`
- Web/worker provider context loaders:
  - `apps/web/lib/server/provider-context.ts`
  - `apps/worker/src/provider-context.ts`

## Sequence

1. Web and worker load encrypted OAuth config and account tokens.
2. Tokens are decrypted server-side using `ENVELOPE_SECRETS_KEY`.
3. Gmail adapter methods execute auth, sync, mutation, and attachment operations.
4. Adapter errors are normalized to provider error codes for retry/status handling.

## Failure Modes

- Invalid OAuth client config: Gmail flows fail before token exchange.
- Refresh token revoked: provider returns auth-revoked path, requiring reconnect.
- Quota/rate errors: retryable provider errors trigger backoff behavior.
- Unexpected provider payload: operations fail and surface in diagnostics/job errors.

## Operational Commands and Checks

- Validate OAuth setup via connect flow in inbox.
- Trigger a known mutation (archive/read) and confirm queue execution.
- Inspect diagnostics export payload for provider/account error metadata.

Related docs: [Connect Gmail](../user-guide/connect-gmail.md), [API Routes Reference](../reference/api-routes.generated.md).
