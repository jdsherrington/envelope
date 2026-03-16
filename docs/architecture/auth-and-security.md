# Auth and Security

Envelope uses server-side sessions, CSRF tokens, and secure defaults in middleware.

## Component Breakdown

- Session issuance and verification in `apps/web/lib/server/auth.ts`.
- Request guards in `apps/web/lib/server/guards.ts`.
- Mutation wrapper in `apps/web/lib/server/mutation-route.ts`.
- Security headers in `apps/web/middleware.ts`.

## Sequence

1. Login/setup creates server session with token hash + CSRF token.
2. Session cookie is HTTP-only; CSRF token is stored in readable cookie.
3. Mutation routes verify session and CSRF token match.
4. Middleware sets CSP, frame protection, referrer policy, no-sniff, permissions policy, and COOP.
5. Production adds HSTS.

## Failure Modes

- Missing/invalid session token: request returns unauthorized.
- Missing or mismatched CSRF token on mutation: request is forbidden.
- Invalid origin in sensitive flows: request rejected.
- Login abuse: rate limiter blocks repeated attempts temporarily.

## Operational Commands and Checks

- Run security regression tests:
  - `bun run test:security-regression`
- Verify middleware headers on a route:
  - `curl -I http://localhost:3000/inbox`
- Validate env values affecting auth/security:
  - `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS`, `ENVELOPE_SECRETS_KEY`

Related docs: [Environment Reference](../reference/environment.generated.md), [Diagnostics and Recovery](../user-guide/diagnostics-and-recovery.md).
