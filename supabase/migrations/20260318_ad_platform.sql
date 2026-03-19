-- Ad Platform tables

-- Advertisers
CREATE TABLE advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website_url text NOT NULL,
  logo_url text,
  contact_email text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON advertisers FOR ALL USING (false);

-- Ad Campaigns
CREATE TABLE ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  start_date timestamptz,
  end_date timestamptz,
  daily_budget_cents int,
  total_budget_cents int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ad_campaigns FOR ALL USING (false);

-- Ads (individual creatives)
CREATE TABLE ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  primary_text text,
  headline text NOT NULL,
  description text,
  image_url text NOT NULL,
  cta_text text NOT NULL DEFAULT 'Shop Now',
  destination_url text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ads FOR ALL USING (false);

-- Ad Targeting (Phase 3, created now with no rows)
CREATE TABLE ad_targeting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('gender', 'age_range', 'state', 'riding_style')),
  target_value text NOT NULL
);

ALTER TABLE ad_targeting ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ad_targeting FOR ALL USING (false);

-- Ad Impressions
CREATE TABLE ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ad_impressions FOR ALL USING (false);

-- Ad Clicks
CREATE TABLE ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ad_clicks FOR ALL USING (false);

-- Ad Dismissals
CREATE TABLE ad_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ad_id, user_id)
);

ALTER TABLE ad_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON ad_dismissals FOR ALL USING (false);

-- Indexes for common queries
CREATE INDEX idx_ad_impressions_ad_id ON ad_impressions(ad_id);
CREATE INDEX idx_ad_impressions_created_at ON ad_impressions(created_at);
CREATE INDEX idx_ad_clicks_ad_id ON ad_clicks(ad_id);
CREATE INDEX idx_ad_clicks_created_at ON ad_clicks(created_at);
CREATE INDEX idx_ad_dismissals_user_id ON ad_dismissals(user_id);

-- App settings (single-row config)
CREATE TABLE app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ads_enabled boolean NOT NULL DEFAULT true
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON app_settings FOR ALL USING (false);

INSERT INTO app_settings (id, ads_enabled) VALUES (1, true);

-- Storage bucket for ad creatives
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ads', 'ads', true, 10485760)
ON CONFLICT (id) DO NOTHING;
