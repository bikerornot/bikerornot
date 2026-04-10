-- Growth instrumentation: structured signup attribution + daily session log.
--
-- #1 — Structured signup attribution on profiles
--
-- Existing `signup_ref_url` is a single freeform string (e.g. "facebook / cpc /
-- spring_2026") which is useful for eyeballing but hard to aggregate cleanly in
-- SQL. Adds a structured column per UTM parameter plus click IDs for paid
-- channels (Facebook `fbclid`, Google `gclid`), plus the landing path so we
-- can correlate attribution with the ad creative / landing page pair.
--
-- `signup_ref_url` stays for backward compatibility with the existing admin UI.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signup_utm_source text,
  ADD COLUMN IF NOT EXISTS signup_utm_medium text,
  ADD COLUMN IF NOT EXISTS signup_utm_campaign text,
  ADD COLUMN IF NOT EXISTS signup_utm_content text,
  ADD COLUMN IF NOT EXISTS signup_utm_term text,
  ADD COLUMN IF NOT EXISTS signup_fbclid text,
  ADD COLUMN IF NOT EXISTS signup_gclid text,
  ADD COLUMN IF NOT EXISTS signup_landing_path text;

-- Indexes to make paid-cohort retention queries fast
CREATE INDEX IF NOT EXISTS idx_profiles_signup_utm_source ON profiles(signup_utm_source) WHERE signup_utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_signup_utm_campaign ON profiles(signup_utm_campaign) WHERE signup_utm_campaign IS NOT NULL;

-- #2 — Daily session log
--
-- `profiles.last_seen_at` only stores a user's most recent visit, which makes
-- historical DAU and real retention (D1 / D7 / D30) unmeasurable. This table
-- logs exactly one row per user per day they visit — enough to compute any
-- retention curve without paying for a full event-stream infrastructure.
--
-- Writes happen from /api/heartbeat, client-gated to fire at most once per
-- browser per day. RLS denies all direct access — only the service role
-- (server) can write and read.

CREATE TABLE IF NOT EXISTS user_sessions (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_day ON user_sessions(day);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access — use service role via heartbeat"
  ON user_sessions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE user_sessions IS 'One row per user per day they visited. Populated from /api/heartbeat. Use to compute DAU, D1/D7/D30 retention, and paid-cohort activation curves.';
