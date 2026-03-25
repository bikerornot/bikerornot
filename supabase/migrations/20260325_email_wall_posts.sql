-- Email preference for wall post notifications
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_wall_posts boolean NOT NULL DEFAULT true;
