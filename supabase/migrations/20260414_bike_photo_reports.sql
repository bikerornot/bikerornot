-- Player-submitted reports on What's That Bike? photos that appear mislabeled
-- or unclear. First report auto-quarantines the photo (game_approved = false)
-- until an admin reviews and either Restores or Keeps Out.
CREATE TABLE IF NOT EXISTS bike_photo_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bike_photo_id uuid NOT NULL REFERENCES bike_photos(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('wrong_year','wrong_make','wrong_model','bad_angle','multiple_bikes')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution text CHECK (resolution IN ('kept_out','restored')),
  resolved_by uuid REFERENCES profiles(id),
  UNIQUE (reporter_id, bike_photo_id)
);

CREATE INDEX IF NOT EXISTS idx_bike_photo_reports_photo ON bike_photo_reports (bike_photo_id);
CREATE INDEX IF NOT EXISTS idx_bike_photo_reports_open ON bike_photo_reports (created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE bike_photo_reports ENABLE ROW LEVEL SECURITY;
