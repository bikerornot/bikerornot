-- Email preference for comment notifications
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_comments boolean NOT NULL DEFAULT true;
