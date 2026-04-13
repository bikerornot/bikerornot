-- Track which rider suggestions were recently shown to each user so we can
-- exclude them from the "Riders to Connect With" widget for a cooldown
-- period (3 days), giving the widget freshness without permanent dismissal.
CREATE TABLE IF NOT EXISTS shown_suggestions (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shown_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shown_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shown_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shown_suggestions_user_shown_at
  ON shown_suggestions (user_id, shown_at DESC);

ALTER TABLE shown_suggestions ENABLE ROW LEVEL SECURITY;
