-- Envelope v1 PRD parity additions

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark',
  density text NOT NULL DEFAULT 'comfortable',
  keymap text NOT NULL DEFAULT 'superhuman',
  hide_rare_labels boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS log_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  level text NOT NULL,
  scope text NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS log_events_user_recorded_at_idx
  ON log_events(user_id, recorded_at DESC);
