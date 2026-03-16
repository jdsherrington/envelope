# Bootstrap and Login

This page describes the first-run bootstrap flow and normal sign-in behavior.

## Preconditions

- Envelope is running locally.
- No users exist yet for bootstrap flow.
- For normal login flow, at least one user has already been created.

## Step-by-Step Procedure

1. Visit `http://localhost:3000`.
2. If no user exists, you are redirected to `/setup`.
3. In setup step 1:
   - Enter admin email.
   - Enter password (minimum 8 chars).
   - Add displayed TOTP secret to authenticator app.
   - Enter current 6-digit TOTP code.
4. Submit **Create user**.
5. In setup step 2, save Gmail OAuth config (client ID, secret, redirect URI).
6. For normal sign-in, open `/login` and provide:
   - Email
   - Password
   - TOTP code
7. Optional: use passkey login from the same page after entering email.

## Expected Outcome

- First successful setup creates user, TOTP factor, session, and CSRF token.
- Existing instances redirect `/setup` to `/inbox`.
- `/login` authenticates with password + TOTP and redirects to `/inbox`.
- Passkey login path can authenticate and redirect to `/inbox` when registered.

## Failure Symptoms and Recovery

- Symptom: `/login` redirects to `/setup` unexpectedly.
  - Recovery: there is no configured user in DB; complete setup first.
- Symptom: `Invalid TOTP code` during setup or login.
  - Recovery: confirm code freshness and authenticator clock sync.
- Symptom: passkey login fails after challenge.
  - Recovery: register passkey in Diagnostics first, then retry with same email.
- Symptom: repeated login failures lead to blocks.
  - Recovery: wait for rate-limit window to reset, then retry with correct credentials.

Next: [Connect Gmail](./connect-gmail.md).
