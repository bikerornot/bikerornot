-- Track group invitations with status (pending/accepted/declined)
-- Hard rule: UNIQUE(group_id, invited_user_id) means once declined, never re-invited
CREATE TABLE IF NOT EXISTS group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(group_id, invited_user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_invites_user ON group_invites(invited_user_id, status);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id, status);
CREATE INDEX IF NOT EXISTS idx_group_invites_invited_by ON group_invites(invited_by, created_at);

-- Track mass invite usage for 30-day cooldown
CREATE TABLE IF NOT EXISTS group_mass_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now(),
  invite_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_group_mass_invites_lookup ON group_mass_invites(group_id, user_id, used_at);

-- Enable RLS
ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_mass_invites ENABLE ROW LEVEL SECURITY;

-- RLS: service role only (all access goes through server actions)
CREATE POLICY "Service role full access" ON group_invites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON group_mass_invites FOR ALL USING (true) WITH CHECK (true);
