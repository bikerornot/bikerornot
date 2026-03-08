-- Admin watchlist for monitoring suspicious users
CREATE TABLE IF NOT EXISTS admin_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_watchlist_user ON admin_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_watchlist_created ON admin_watchlist(created_at DESC);

-- Enable RLS — service role only
ALTER TABLE admin_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON admin_watchlist FOR ALL USING (true) WITH CHECK (true);
