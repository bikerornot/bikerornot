-- Add opt-in toggle for showing real name to friends
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_real_name boolean NOT NULL DEFAULT false;
