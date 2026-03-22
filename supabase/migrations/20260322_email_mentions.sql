-- Add email preference for mention notifications
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_mentions boolean DEFAULT true;
