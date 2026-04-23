-- Check-in locations ("Joe's Diner", "Blue Ridge Parkway", etc.) for posts.
-- We cache every unique Mapbox place the first time someone checks in so
-- future check-ins reuse the same row (cheaper than querying Mapbox every
-- time and gives us a "posts at this place" view later for social discovery).

CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Mapbox feature id, e.g. "poi.123456789". Source of truth for dedupe;
  -- a single real-world place maps to exactly one mapbox_id per provider.
  mapbox_id text NOT NULL UNIQUE,
  name text NOT NULL,
  -- Full human-readable address / context line. What Mapbox returns as
  -- "place_formatted" or "full_address" depending on the endpoint.
  full_address text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  -- Mapbox category (food_and_drink / shopping / outdoors / lodging / ...)
  -- — useful for future filtering ("show me only biker-relevant places")
  -- but not required for the MVP check-in surface.
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_mapbox_id_idx ON places (mapbox_id);
CREATE INDEX IF NOT EXISTS places_lat_lng_idx ON places (latitude, longitude);

-- Attach a place to a post. Nullable — most posts won't have a check-in.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES places(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS posts_place_id_idx ON posts (place_id) WHERE place_id IS NOT NULL;

-- RLS: places are shared infrastructure. Anyone authenticated can read them
-- (so the feed / post page can display the place on any visible post) and
-- insert new ones (creating a check-in adds a row if one doesn't exist
-- yet). Update/delete are admin-only through the service role client.
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "places_select" ON places FOR SELECT TO authenticated USING (true);
CREATE POLICY "places_insert" ON places FOR INSERT TO authenticated WITH CHECK (true);
