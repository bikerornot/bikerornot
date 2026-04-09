-- Make the deny-all posture on game_answers explicit.
--
-- All reads and writes to this table go through src/app/actions/game.ts using
-- the service role client, which bypasses RLS. Regular anon / authenticated
-- users must never query this table directly (it contains per-user game
-- history). Previously RLS was enabled with zero policies, which also denies
-- everything — but the Supabase linter flagged the missing-policy state as an
-- INFO-level warning ("rls_enabled_no_policy"). This policy documents the
-- intent in schema rather than leaving it implicit.

CREATE POLICY "Deny all direct access — use service role via server actions"
  ON public.game_answers
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
