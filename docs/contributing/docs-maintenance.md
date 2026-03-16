# Docs Maintenance

This repository treats docs as versioned code.

## Workflow

1. Update curated docs under `docs/` for behavior changes.
2. Regenerate generated references:
   - `bun run docs:generate`
3. Validate docs freshness + links:
   - `bun run docs:check`
4. Commit curated and generated docs in the same change.

## Generated Files

Do not hand-edit generated files:

- `docs/.generated/inventory.json`
- `docs/reference/api-routes.generated.md`
- `docs/reference/environment.generated.md`
- `docs/reference/command-catalog.generated.md`
- `docs/reference/data-model.generated.md`

## Internal Contract

The docs inventory contract is defined in:

- `scripts/docs/types.ts` (`DocsInventory` and related types)

## Coverage Expectations

`bun run docs:check` enforces:

- API route inventory coverage for every `apps/web/app/api/**/route.ts`
- Environment variable coverage from `.env.example`, web env schema, worker env schema
- Command keybinding coverage from inbox command source
- Markdown link validity for `docs/**/*.md` and root `README.md`

## PR Checklist Recommendation

Include this checkbox in PRs:

- `[ ] Docs updated for user-facing, API, or operational changes`
