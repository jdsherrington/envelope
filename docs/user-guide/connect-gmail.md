# Connect Gmail

This guide covers connecting a Gmail account after setup.

## Preconditions

- Admin user is created and logged in.
- Gmail OAuth client config has been saved in setup.
- Redirect URI configured in Google Cloud matches `/api/auth/gmail/callback` for your host.

## Step-by-Step Procedure

1. Open `/inbox`.
2. If no accounts are linked, use **Connect with Google**.
3. Approve requested Gmail scopes in Google OAuth screen.
4. Wait for redirect back to `/inbox?connected=1`.
5. Confirm initial sync banner and account status.
6. If needed, trigger manual refresh:
   - Command palette (`Ctrl/Cmd+K`) and run **Refresh account sync**, or
   - use diagnostics recovery actions.

## Expected Outcome

- OAuth state and PKCE verifier are generated server-side.
- Callback exchanges code for token set and upserts account.
- Initial sync job (`gmail.initialSync`) is enqueued.
- Inbox shows connected account and starts loading threads.

## Failure Symptoms and Recovery

- Symptom: redirected with `?oauth=missing` or `?oauth=state_invalid`.
  - Recovery: restart OAuth flow from inbox; do not reuse stale callback URLs.
- Symptom: redirected with `?oauth=error`.
  - Recovery: verify OAuth credentials and redirect URI; then reconnect.
- Symptom: account status becomes `needs_reauth`.
  - Recovery: use reconnect action from diagnostics.
- Symptom: no threads after connect.
  - Recovery: confirm worker is running and check diagnostics queue for failed jobs.

Next: [Inbox and Keyboard](./inbox-and-keyboard.md).
