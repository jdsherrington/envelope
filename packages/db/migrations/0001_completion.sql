-- Envelope v1 completion expansion

ALTER TABLE sync_state
  ADD COLUMN IF NOT EXISTS initial_sync_in_progress boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS initial_sync_phase text,
  ADD COLUMN IF NOT EXISTS initial_sync_target integer,
  ADD COLUMN IF NOT EXISTS initial_sync_processed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_sync_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_draft_id text,
  provider_thread_id text,
  to_recipients jsonb NOT NULL,
  cc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL,
  text_body text,
  html_body text,
  send_later_at timestamptz,
  last_provider_message_id text,
  last_provider_thread_id text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS drafts_account_provider_draft_unique
  ON drafts(account_id, provider_draft_id);

CREATE TABLE IF NOT EXISTS snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reminders_account_thread_remind_at_unique
  ON reminders(account_id, thread_id, remind_at);

CREATE TABLE IF NOT EXISTS attachment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  provider_attachment_id text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer,
  bytes_base64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS attachment_cache_account_message_attachment_unique
  ON attachment_cache(account_id, provider_message_id, provider_attachment_id);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  public_key text NOT NULL,
  counter integer NOT NULL DEFAULT 0,
  backed_up boolean,
  transports text[] NOT NULL DEFAULT '{}',
  device_type text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS passkey_credentials_credential_id_unique
  ON passkey_credentials(credential_id);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flow text NOT NULL,
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS passkey_challenges_user_flow_unique
  ON passkey_challenges(user_id, flow);

CREATE TABLE IF NOT EXISTS quota_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  bucket_type text NOT NULL,
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quota_rollups_account_bucket_unique
  ON quota_rollups(account_id, bucket_type, bucket_start);

CREATE TABLE IF NOT EXISTS command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  command_id text NOT NULL,
  command_version integer NOT NULL,
  view_scope text NOT NULL,
  selection_count integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  duration_ms integer,
  error_message text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
