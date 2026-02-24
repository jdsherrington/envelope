-- Initial schema migration for Envelope v1 MVP
-- Generated from packages/db/src/schema.ts

CREATE TYPE account_status AS ENUM ('ok', 'syncing', 'rate_limited', 'needs_reauth', 'error');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'dead');
CREATE TYPE label_type AS ENUM ('system', 'user');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE totp_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_rate_limits (
  key text PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_client_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL UNIQUE,
  encrypted_client_id text NOT NULL,
  encrypted_client_secret text NOT NULL,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  email varchar(320) NOT NULL,
  status account_status NOT NULL DEFAULT 'syncing',
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  sync_cursor text,
  last_synced_at timestamptz,
  backoff_until timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, email)
);

CREATE TABLE labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_label_id text NOT NULL,
  name text NOT NULL,
  type label_type NOT NULL,
  color_background text,
  color_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, provider_label_id)
);

CREATE TABLE threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_thread_id text NOT NULL,
  subject text NOT NULL,
  snippet text NOT NULL,
  last_message_at timestamptz NOT NULL,
  unread_count integer NOT NULL DEFAULT 0,
  provider_label_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, provider_thread_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  provider_thread_id text NOT NULL,
  from_name text,
  from_email text NOT NULL,
  to_recipients jsonb NOT NULL,
  cc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL,
  internal_date timestamptz NOT NULL,
  snippet text,
  text_body text,
  html_body text,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, provider_message_id)
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  retry_after_ms integer,
  last_error_code text,
  last_error_message text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_state (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  cursor_raw text,
  last_run_at timestamptz,
  backoff_until timestamptz,
  last_error_code text,
  last_error_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quota_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  window_label text NOT NULL,
  used integer,
  limit integer,
  backoff_until timestamptz,
  error_code text,
  error_message text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
