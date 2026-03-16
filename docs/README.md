# Envelope Documentation

This documentation is the source of truth for how Envelope works in this repository.

## Start Here

- [User Guide](./user-guide/getting-started.md)
- [Architecture](./architecture/system-overview.md)
- [Operations](./ops/local-dev-and-deploy.md)
- [Generated Reference](./reference/api-routes.generated.md)

## User Guide

- [Getting Started](./user-guide/getting-started.md)
- [Bootstrap and Login](./user-guide/bootstrap-and-login.md)
- [Connect Gmail](./user-guide/connect-gmail.md)
- [Inbox and Keyboard](./user-guide/inbox-and-keyboard.md)
- [Compose, Reply, Forward](./user-guide/compose-reply-forward.md)
- [Threads and Attachments](./user-guide/threads-attachments.md)
- [Settings](./user-guide/settings.md)
- [Diagnostics and Recovery](./user-guide/diagnostics-and-recovery.md)
- [FAQ and Troubleshooting](./user-guide/faq-troubleshooting.md)

## Architecture

- [System Overview](./architecture/system-overview.md)
- [Auth and Security](./architecture/auth-and-security.md)
- [Sync, Jobs, and Worker](./architecture/sync-jobs-and-worker.md)
- [Provider Adapter Model](./architecture/provider-adapter-model.md)

## Operations

- [Local Dev and Deploy](./ops/local-dev-and-deploy.md)
- [CI Tests and Quality Gates](./ops/ci-tests-and-quality-gates.md)
- [Incident Runbook](./ops/incident-runbook.md)

## Reference (Generated)

- [API Routes](./reference/api-routes.generated.md)
- [Environment](./reference/environment.generated.md)
- [Command Catalog](./reference/command-catalog.generated.md)
- [Data Model](./reference/data-model.generated.md)

## Contributing

- [Docs Maintenance](./contributing/docs-maintenance.md)

## Generation Workflow

1. Regenerate inventory and generated reference docs:
   - `bun run docs:generate`
2. Validate generated outputs and docs links:
   - `bun run docs:check`
3. Commit curated docs and generated updates together.
