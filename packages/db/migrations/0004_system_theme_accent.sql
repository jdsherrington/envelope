ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS accent text NOT NULL DEFAULT 'amber';

