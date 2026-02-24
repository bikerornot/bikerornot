-- Groups feature migration

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  cover_photo_url text,
  privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private')),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  joined_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(group_id, user_id)
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view groups"
  ON groups FOR SELECT USING (true);

CREATE POLICY "Authenticated can create groups"
  ON groups FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Admins can update group"
  ON groups FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = groups.id
        AND user_id = auth.uid()
        AND role = 'admin'
        AND status = 'active'
    )
  );

CREATE POLICY "Anyone can view active members"
  ON group_members FOR SELECT USING (true);

CREATE POLICY "Users can join or request"
  ON group_members FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave or admins can manage"
  ON group_members FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
        AND gm.status = 'active'
    )
  );

CREATE POLICY "Admins can approve requests"
  ON group_members FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
        AND gm.status = 'active'
    )
  );

ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE SET NULL;
