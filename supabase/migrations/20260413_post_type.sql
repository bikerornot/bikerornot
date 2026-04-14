-- Add post_type column so the feed renderer can detect special posts
-- (currently: game_share) and show tailored UI like a "Play Now" button.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_type text;
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts (post_type) WHERE post_type IS NOT NULL;
