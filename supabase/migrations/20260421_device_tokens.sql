-- FCM / APNs device tokens. Android app POSTs its token on launch; server-side
-- send functions fan out to all active tokens for a given user_id.
--
-- One physical device usually produces one stable token, but FCM rotates on
-- uninstall/reinstall and some OEM edge cases, so (user_id, token) is the
-- composite identity — same user with same token is an upsert, new token
-- from same user adds a row. When FCM send returns "unregistered" we'll
-- delete the row; that's phase 2 work.
CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz DEFAULT now() NOT NULL,
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON device_tokens (user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
-- No public RLS policies — all reads/writes go through server-side endpoints
-- using the service role key. The anon key gets nothing.
