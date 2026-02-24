ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
