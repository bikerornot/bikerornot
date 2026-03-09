-- Extend content_flags to support comment scanning
ALTER TABLE content_flags
  ADD COLUMN IF NOT EXISTS comment_id uuid REFERENCES comments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS flag_type text NOT NULL DEFAULT 'message' CHECK (flag_type IN ('message', 'comment'));
