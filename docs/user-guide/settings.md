# Settings

Settings are user-scoped and persisted server-side.

## Preconditions

- You are authenticated.
- You can access `/settings`.

## Step-by-Step Procedure

1. Open `/settings`.
2. Update one or more preferences:
   - Theme: dark/light
   - Density: comfortable/compact
   - Keymap: superhuman/vim
   - Labels: hide/show rare labels
   - Contrast: standard/high
3. Confirm save status after each update.
4. Return to inbox and verify behavior changed.

## Expected Outcome

- Settings updates persist through `/api/settings`.
- Inbox command context reflects updated keymap/theme/density/contrast.
- Current values are visible in settings panel and reloaded on next session.

## Failure Symptoms and Recovery

- Symptom: save reports `Failed to save settings`.
  - Recovery: verify session validity and retry; inspect API response in browser devtools.
- Symptom: settings appear saved but UI unchanged.
  - Recovery: navigate back to inbox and refresh account view; ensure request succeeded.

Next: [Diagnostics and Recovery](./diagnostics-and-recovery.md).
