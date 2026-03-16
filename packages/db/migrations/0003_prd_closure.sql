-- Envelope v1 PRD closure additions

DO $$
BEGIN
  CREATE TYPE message_body_state AS ENUM ('deferred', 'present', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE snippet_kind AS ENUM ('snippet', 'template');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS contrast text NOT NULL DEFAULT 'standard';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS body_state message_body_state NOT NULL DEFAULT 'deferred';

UPDATE messages
SET body_state = CASE
  WHEN text_body IS NOT NULL OR html_body IS NOT NULL THEN 'present'::message_body_state
  ELSE 'deferred'::message_body_state
END
WHERE body_state IS NULL OR body_state = 'deferred'::message_body_state;

ALTER TABLE snippets
  ADD COLUMN IF NOT EXISTS kind snippet_kind NOT NULL DEFAULT 'snippet';

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id text PRIMARY KEY,
  host text NOT NULL,
  pid integer NOT NULL,
  version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_heartbeats_host_pid_unique
  ON worker_heartbeats(host, pid);

CREATE INDEX IF NOT EXISTS worker_heartbeats_recorded_at_idx
  ON worker_heartbeats(recorded_at DESC);

CREATE TABLE IF NOT EXISTS perf_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  route text NOT NULL,
  metric text NOT NULL,
  value_ms integer NOT NULL,
  metadata jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perf_events_user_recorded_at_idx
  ON perf_events(user_id, recorded_at DESC);
