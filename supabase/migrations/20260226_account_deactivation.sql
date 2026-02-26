-- Account deactivation and scheduled deletion
-- deactivated_at: set when user deactivates; cleared automatically on next login
-- deletion_scheduled_at: set to now() + 30 days when user requests deletion;
--   a pg_cron job (see below) hard-deletes the auth.users row when this date passes,
--   which cascades to profiles

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;

-- ─── Optional: scheduled deletion via pg_cron ─────────────────────────────
-- Requires the pg_cron extension. Enable it at:
--   Supabase Dashboard → Database → Extensions → pg_cron
--
-- Once enabled, run this separately in the SQL editor:
--
-- SELECT cron.schedule(
--   'delete-scheduled-accounts',
--   '0 2 * * *',
--   $$
--     DELETE FROM auth.users
--     WHERE id IN (
--       SELECT id FROM profiles
--       WHERE deletion_scheduled_at IS NOT NULL
--         AND deletion_scheduled_at <= now()
--     );
--   $$
-- );
