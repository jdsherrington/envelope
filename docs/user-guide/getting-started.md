# Getting Started

This guide gets a local Envelope instance from clone to first usable inbox.

## Preconditions

- Bun is installed.
- Docker is installed and running.
- You can run commands from the repository root.
- You have (or will create) Google OAuth credentials for Gmail.

## Step-by-Step Procedure

1. Create local environment config:
   - `cp .env.example .env`
2. Install dependencies:
   - `bun install`
3. Start infrastructure (Postgres + app services):
   - `docker compose up --build`
4. Run database migrations in another terminal:
   - `bun run db:migrate`
5. Start local development processes if you are not using compose app containers:
   - `bun run dev:web`
   - `bun run dev:worker`
6. Open `http://localhost:3000`.
7. Complete setup:
   - Create admin user with password + TOTP.
   - Save Gmail OAuth client credentials.
8. Connect Gmail from Inbox using **Connect with Google**.

## Expected Outcome

- `/setup` creates the first user and stores TOTP factor.
- `/inbox` loads and either:
  - prompts to connect first Gmail account, or
  - shows inbox threads if an account is connected.
- `GET /health` returns healthy status when DB and worker heartbeat are healthy.

## Failure Symptoms and Recovery

- Symptom: `db:migrate` fails with connection error.
  - Recovery: verify `docker compose up` is running and `DATABASE_URL` points to Postgres.
- Symptom: setup rejects TOTP code.
  - Recovery: ensure authenticator time is correct and use the displayed secret for the same user setup session.
- Symptom: inbox shows OAuth error after Google redirect.
  - Recovery: verify client ID/secret and redirect URI in setup match Google Cloud app config.
- Symptom: health endpoint degraded.
  - Recovery: check worker process, worker logs, and database connectivity.

Next: [Bootstrap and Login](./bootstrap-and-login.md).
