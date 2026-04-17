-- When an admin confirms a bike photo is misclassified ("Keep Out"), we void
-- every player's answer on that photo so bad data doesn't pollute the
-- leaderboard. Voiding is reversible: restoring the photo clears voided_at.

ALTER TABLE game_answers
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_reason text;

-- Partial index for the hot leaderboard path (only live answers).
CREATE INDEX IF NOT EXISTS idx_game_answers_live
  ON game_answers(user_id, created_at DESC)
  WHERE voided_at IS NULL;

-- Lookup for bulk-void / un-void by photo.
CREATE INDEX IF NOT EXISTS idx_game_answers_photo
  ON game_answers(bike_photo_id);
