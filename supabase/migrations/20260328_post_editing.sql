-- Allow users to edit their own posts within 15 minutes if no comments exist
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at timestamptz;
