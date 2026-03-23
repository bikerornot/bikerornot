-- Phone verification columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verification_required boolean NOT NULL DEFAULT false;

-- One verified phone per account (partial index allows NULLs and unverified)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_verified
  ON profiles (phone_number)
  WHERE phone_verified_at IS NOT NULL;
