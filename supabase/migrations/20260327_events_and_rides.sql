-- ============================================================
-- Rides & Events feature
-- ============================================================

-- 1. Events table (unified for rides and events)
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ride', 'event')),

  -- Ownership
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE SET NULL,

  -- Identity
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  cover_photo_url text,
  category text CHECK (category IN (
    'group_ride', 'rally', 'charity', 'track_day', 'bike_night',
    'show', 'swap_meet', 'workshop', 'social', 'other'
  )),

  -- Scheduling
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/New_York',

  -- Recurrence
  recurrence_rule text CHECK (recurrence_rule IN ('weekly', 'biweekly', 'monthly')),
  recurrence_parent_id uuid REFERENCES events(id) ON DELETE SET NULL,
  recurrence_index int,

  -- Location (Event: venue; Ride: start location)
  venue_name text,
  address text,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,

  -- Ride-specific: end location
  end_address text,
  end_city text,
  end_state text,
  end_zip_code text,
  end_latitude numeric,
  end_longitude numeric,
  estimated_distance_miles numeric,

  -- Capacity
  max_attendees int,

  -- Status
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  cancelled_reason text,

  -- Denormalized counters
  going_count int NOT NULL DEFAULT 0,
  interested_count int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_creator ON events(creator_id);
CREATE INDEX idx_events_group ON events(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_events_starts_at ON events(starts_at);
CREATE INDEX idx_events_status_starts ON events(status, starts_at);
CREATE INDEX idx_events_type_status ON events(type, status);
CREATE INDEX idx_events_recurrence_parent ON events(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;
CREATE INDEX idx_events_location ON events(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX idx_events_slug ON events(slug);

-- 2. Ride stops / waypoints
CREATE TABLE event_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  label text,
  address text NOT NULL,
  city text,
  state text,
  zip_code text,
  latitude numeric,
  longitude numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, order_index)
);

CREATE INDEX idx_event_stops_event ON event_stops(event_id);

-- 3. RSVPs
CREATE TABLE event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going', 'interested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_rsvps_event_status ON event_rsvps(event_id, status);
CREATE INDEX idx_event_rsvps_user ON event_rsvps(user_id);

-- 4. Invites
CREATE TABLE event_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(event_id, invited_user_id)
);

CREATE INDEX idx_event_invites_user ON event_invites(invited_user_id, status);
CREATE INDEX idx_event_invites_event ON event_invites(event_id, status);
CREATE INDEX idx_event_invites_by ON event_invites(invited_by, created_at);

-- 5. Add event_id to posts (for event discussion + feed posts)
ALTER TABLE posts ADD COLUMN event_id uuid REFERENCES events(id) ON DELETE SET NULL;
CREATE INDEX idx_posts_event ON posts(event_id) WHERE event_id IS NOT NULL;

-- 6. Add event_id to notifications
ALTER TABLE notifications ADD COLUMN event_id uuid REFERENCES events(id) ON DELETE CASCADE;

-- 7. Expand notification type constraint
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'friend_request', 'friend_accepted', 'post_like', 'post_comment',
    'comment_reply', 'comment_like', 'group_invite', 'wall_post',
    'dmca_takedown', 'mention',
    'event_invite', 'event_rsvp', 'event_reminder', 'event_cancelled', 'event_update'
  ])
);

-- 8. RLS (service-role-only, matching existing pattern)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON event_stops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON event_rsvps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON event_invites FOR ALL USING (true) WITH CHECK (true);
