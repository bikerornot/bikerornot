ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_ip text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_country text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signup_region text;
