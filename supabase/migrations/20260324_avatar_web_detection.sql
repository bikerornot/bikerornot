-- Store Google Vision Web Detection results for profile photos
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_web_detection jsonb;

-- Index for quick lookup of suspicious avatars
CREATE INDEX IF NOT EXISTS idx_profiles_avatar_suspicious
  ON profiles ((avatar_web_detection->>'isSuspicious'))
  WHERE avatar_web_detection IS NOT NULL;
