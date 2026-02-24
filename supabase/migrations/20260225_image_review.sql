-- Image review queue
-- post_images: reviewed_at tracks when a mod approved the image
-- profiles: avatar_reviewed_at tracks when a mod approved the current avatar
--           Cleared automatically when the user changes their avatar (handled in app layer)

ALTER TABLE post_images ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE profiles    ADD COLUMN IF NOT EXISTS avatar_reviewed_at timestamptz;
