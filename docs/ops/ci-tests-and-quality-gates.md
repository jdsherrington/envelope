# CI Tests and Quality Gates

CI is defined in `.github/workflows/ci.yml`.

## Component Breakdown

Current jobs:

- `typecheck`
- `unit`
- `security-regression`
- `integration`
- `build`
- `e2e`
- `perf-smoke`
- `docs` (added for generated-doc freshness and markdown link validation)

## Sequence

1. Checkout repository.
2. Install dependencies with frozen lockfile.
3. Run static checks and tests.
4. Run build.
5. Run docs validation.
6. For e2e/perf jobs, start Postgres and web app then run Playwright.

## Failure Modes

- Generated docs stale compared with code.
- Broken markdown links in docs or root README.
- Regression tests fail due API/security behavior drift.
- E2E failures due setup/bootstrap workflow changes.

## Operational Commands and Checks

- Local equivalent CI command:
  - `bun run ci`
- Generate docs before pushing:
  - `bun run docs:generate`
- Validate docs before pushing:
  - `bun run docs:check`
- Run end-to-end tests:
  - `bun run test:e2e`

Related docs: [Docs Maintenance](../contributing/docs-maintenance.md).
