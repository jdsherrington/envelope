# Inbox and Keyboard

Envelope is built around inbox triage with command palette and keyboard actions.

## Preconditions

- At least one Gmail account is connected.
- Initial sync has produced thread data.
- You are on `/inbox`.

## Step-by-Step Procedure

1. Open inbox for active account (`/inbox?accountId=<id>`).
2. Use search input to query threads.
3. Select threads in the list.
4. Open command palette:
   - `Ctrl+K` or `Cmd+K`.
5. Run commands such as:
   - Archive selected (`e`)
   - Mark read/unread (`shift+r`, `u`)
   - Open settings (`g s`)
   - Open diagnostics (`g d`)
   - Focus search (`/`)
6. Switch account using command palette command **Switch account**.
7. Open thread with Enter when selected.

## Expected Outcome

- Inbox displays threads for active account with account-aware search.
- Command palette executes command registry actions and logs command events.
- Keyboard chords and single-key bindings execute based on current keymap/scope.

## Failure Symptoms and Recovery

- Symptom: command palette opens but command execution fails.
  - Recovery: inspect status/error message in UI and check diagnostics command events.
- Symptom: `Refresh account sync` reports errors.
  - Recovery: verify account ownership, worker status, and queue health.
- Symptom: no search results for known thread.
  - Recovery: clear query, confirm account selection, and run manual sync refresh.

Next: [Compose, Reply, Forward](./compose-reply-forward.md).
