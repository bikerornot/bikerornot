-- Harley-Davidson dealer database.
-- Scraped from harley-davidson.com/us/en/tools/find-a-dealer/<slug>/<id> by
-- scripts/scrape-hd-dealers.mjs. ID-enumeration strategy — see that script for
-- details. Tables are admin-only (no RLS policies yet).

-- 1. Dealers. One row per dealership, keyed by HD's own numeric dealer id.
CREATE TABLE IF NOT EXISTS hd_dealers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hd_dealer_id      text NOT NULL UNIQUE,
  hd_auth_code      text,
  name              text NOT NULL,
  dba_name          text,
  address1          text,
  city              text,
  state             text,
  postal_code       text,
  country           text,
  phone             text,
  fax               text,
  email             text,
  website           text,
  latitude          numeric,
  longitude         numeric,
  hours_raw         text,
  is_edealer        boolean,
  has_buell         boolean,
  has_no_bike       boolean,
  online_rental     boolean,
  offerings         jsonb,
  program_codes     jsonb,
  hog_info          jsonb,
  riders_edge_info  jsonb,
  test_ride_info    jsonb,
  commerce_info     jsonb,
  is_active         boolean NOT NULL DEFAULT true,
  source            text NOT NULL DEFAULT 'hd_locator',
  raw_payload       jsonb,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_scraped_at   timestamptz NOT NULL DEFAULT now(),
  last_verified_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hd_dealers_state ON hd_dealers(state);
CREATE INDEX IF NOT EXISTS idx_hd_dealers_country ON hd_dealers(country);
CREATE INDEX IF NOT EXISTS idx_hd_dealers_active ON hd_dealers(is_active);
CREATE INDEX IF NOT EXISTS idx_hd_dealers_postal ON hd_dealers(postal_code);

-- 2. Employees / contacts per dealer. Seeded with HD's `eCommerceContact` on
-- initial scrape; enriched later via dealer-website scrapes or B2B providers.
CREATE TABLE IF NOT EXISTS hd_dealer_contacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id            uuid NOT NULL REFERENCES hd_dealers(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  title                text,
  title_normalized     text,
  email                text,
  phone_direct         text,
  phone_mobile         text,
  linkedin_url         text,
  source               text,
  source_url           text,
  is_active            boolean NOT NULL DEFAULT true,
  verification_status  text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'stale', 'bounced')),
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_verified_at     timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hd_contacts_dealer ON hd_dealer_contacts(dealer_id);
CREATE INDEX IF NOT EXISTS idx_hd_contacts_title ON hd_dealer_contacts(title_normalized);
CREATE INDEX IF NOT EXISTS idx_hd_contacts_email ON hd_dealer_contacts(email);

-- Prevent duplicate seed rows when scraper re-runs. Plain column index so
-- PostgREST can use it for ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hd_contacts_dedupe
  ON hd_dealer_contacts(dealer_id, source, name);

-- 3. updated_at triggers
CREATE OR REPLACE FUNCTION hd_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hd_dealers_updated_at ON hd_dealers;
CREATE TRIGGER trg_hd_dealers_updated_at
  BEFORE UPDATE ON hd_dealers
  FOR EACH ROW EXECUTE FUNCTION hd_touch_updated_at();

DROP TRIGGER IF EXISTS trg_hd_contacts_updated_at ON hd_dealer_contacts;
CREATE TRIGGER trg_hd_contacts_updated_at
  BEFORE UPDATE ON hd_dealer_contacts
  FOR EACH ROW EXECUTE FUNCTION hd_touch_updated_at();
