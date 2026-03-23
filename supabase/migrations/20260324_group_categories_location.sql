-- Add columns
ALTER TABLE groups ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS latitude float8;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS longitude float8;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS last_post_at timestamptz;

-- Add check constraint on category
ALTER TABLE groups ADD CONSTRAINT groups_category_check
  CHECK (category IN (
    'brand', 'local', 'events', 'mechanical',
    'women_riders', 'veterans', 'clubs', 'new_riders',
    'touring_travel', 'social'
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_groups_location ON groups(latitude, longitude) WHERE latitude IS NOT NULL AND status = 'active';

-- Trigger: update last_post_at on new group posts
CREATE OR REPLACE FUNCTION update_group_last_post_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    UPDATE groups SET last_post_at = NOW() WHERE id = NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_group_last_post_at ON posts;
CREATE TRIGGER trg_group_last_post_at
  AFTER INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_group_last_post_at();

-- Backfill last_post_at from existing posts
UPDATE groups g
SET last_post_at = sub.latest
FROM (
  SELECT group_id, MAX(created_at) AS latest
  FROM posts
  WHERE group_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY group_id
) sub
WHERE g.id = sub.group_id;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
