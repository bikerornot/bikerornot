-- Site banners: admin-managed announcement banners shown to users
CREATE TABLE IF NOT EXISTS site_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  link_url text,
  link_text text,
  bg_color text NOT NULL DEFAULT 'orange',
  active boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  dismissible boolean NOT NULL DEFAULT true,
  audience text NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'unverified', 'verified')),
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Track which users dismissed which banners
CREATE TABLE IF NOT EXISTS banner_dismissals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banner_id uuid NOT NULL REFERENCES site_banners(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, banner_id)
);

CREATE INDEX IF NOT EXISTS idx_site_banners_active ON site_banners(active, priority DESC) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_banner_dismissals_user ON banner_dismissals(user_id);
