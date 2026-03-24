-- Add columns to support listing deactivation (pause/resume)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS remaining_days integer;
