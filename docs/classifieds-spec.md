# BikerOrNot — Classifieds Feature Spec
*Motorcycles · Web (Next.js) · Shared Supabase Backend*

---

## Overview

Classifieds is a motorcycle-only buy/sell marketplace embedded within BikerOrNot. The platform advantage over Craigslist and Facebook Marketplace is trust: buyers can see the seller's full BikerOrNot profile, mutual friends, and member history. Listings integrate directly with the Garage feature — sellers import bike data with one click rather than re-entering everything.

### Core Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Who can list | Email confirmed + SMS verified members | Reduces fraud; SMS verification becomes a trust signal for buyers |
| Listing limit | 3 active listings per member | Covers daily rider + project bike + spare; still prevents dealer abuse |
| Contact method | BikerOrNot DM system only | Keeps communication in-platform; no phone/email exposure |
| Garage import | Yes — one-click pre-fill from `user_bikes` table | Primary differentiator; reduces create-listing friction |
| Listing duration | 90 days | Standard for vehicle classifieds |
| Expiration email | 7 days before expiry via Resend | Reduces stale inventory |
| Post-expiry | Listing moves to Expired tab; one-click renew | Sellers control their inventory lifecycle |
| Parts & accessories | Deferred to Phase 2 | Schema designed for clean extension |
| Server pattern | Server actions (`'use server'`) with `getServiceClient()` | Matches entire codebase — no route handlers |
| Image compression | Client-side via `compressImage()` (`browser-image-compression`) | Already used everywhere; no `sharp` dependency needed |
| Geocoding | `geocodeZip()` from `src/lib/geocode.ts` (zippopotam.us) | Already in use for profiles, groups, people search |
| Distance unit | Miles (consistent with Find Riders, Groups Near Me) | US-focused platform |

---

## Pages & Routes

| Route | Page | Auth |
|---|---|---|
| `/classifieds` | Browse / Search | Public |
| `/classifieds/[id]` | Listing Detail | Public |
| `/classifieds/new` | Create Listing (wizard) | Verified member (email + SMS) |
| `/classifieds/[id]/edit` | Edit Listing | Owner only |
| `/classifieds/my-listings` | Seller Dashboard | Authenticated |
| `/classifieds/saved` | Saved Listings (Watchlist) | Authenticated |
| `/classifieds/seller/[username]` | Seller's Public Listings | Public |

---

## Database Schema

### Tables

```sql
-- -----------------------------------------------------------------
-- LISTINGS
-- -----------------------------------------------------------------
create table listings (
  id                uuid        primary key default gen_random_uuid(),
  seller_id         uuid        not null references profiles(id) on delete cascade,
  user_bike_id      uuid        references user_bikes(id) on delete set null,

  -- Status lifecycle: draft -> active -> sold | expired | removed
  status            text        not null default 'draft'
                    check (status in ('draft', 'active', 'sold', 'expired', 'removed')),

  -- Bike identity (NHTSA vPIC values)
  category          text        not null
                    check (category in (
                      'cruiser', 'touring_bagger', 'trike', 'sport_naked',
                      'dirt_offroad', 'dual_sport_adventure', 'custom_chopper',
                      'vintage_classic', 'scooter_moped', 'other'
                    )),
  year              int         not null check (year >= 1900 and year <= extract(year from now()) + 1),
  make              text        not null,
  model             text        not null,
  trim              text,
  color             text,
  vin               text        check (vin is null or length(vin) = 17),

  -- Condition & specs
  mileage           int         check (mileage >= 0),
  condition         text        not null
                    check (condition in ('excellent', 'good', 'fair', 'project')),
  modifications     text,

  -- Listing content
  title             text        not null check (length(title) between 5 and 100),
  description       text        check (length(description) <= 5000),

  -- Pricing (stored in cents; null = make offer)
  price             int         check (price is null or price >= 0),
  price_type        text        not null default 'fixed'
                    check (price_type in ('fixed', 'obo', 'offer')),
  trade_considered  bool        not null default false,

  -- Location (geocoded from zip via geocodeZip in src/lib/geocode.ts)
  zip_code          text        not null,
  city              text,
  state             text,
  latitude          float8,
  longitude         float8,

  -- Phone display — reads from profiles.phone_number when show_phone is true
  show_phone        bool        not null default false,

  -- Metrics (denormalized for performance)
  view_count        int         not null default 0,
  save_count        int         not null default 0,

  -- Lifecycle timestamps
  published_at      timestamptz,
  expires_at        timestamptz,
  renewal_email_sent_at timestamptz,
  sold_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- -----------------------------------------------------------------
-- LISTING PHOTOS
-- -----------------------------------------------------------------
create table listing_images (
  id            uuid        primary key default gen_random_uuid(),
  listing_id    uuid        not null references listings(id) on delete cascade,
  storage_path  text        not null,
  order_index   int         not null default 0,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- SAVED LISTINGS (BUYER WATCHLIST)
-- -----------------------------------------------------------------
create table saved_listings (
  user_id     uuid        not null references profiles(id) on delete cascade,
  listing_id  uuid        not null references listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- -----------------------------------------------------------------
-- LISTING VIEWS (ANALYTICS)
-- -----------------------------------------------------------------
create table listing_views (
  id          uuid        primary key default gen_random_uuid(),
  listing_id  uuid        not null references listings(id) on delete cascade,
  viewer_id   uuid        references profiles(id) on delete set null, -- null = anonymous
  created_at  timestamptz not null default now()
);
```

### Indexes

```sql
-- Active listing queries (most common read path)
create index listings_status_expires_idx    on listings (status, expires_at);
create index listings_seller_idx            on listings (seller_id);
create index listings_user_bike_idx         on listings (user_bike_id);

-- Filter queries
create index listings_category_idx          on listings (category);
create index listings_make_model_year_idx   on listings (make, model, year);
create index listings_price_idx             on listings (price);
create index listings_mileage_idx           on listings (mileage);
create index listings_condition_idx         on listings (condition);

-- Geo proximity
create index listings_geo_idx              on listings (latitude, longitude);

-- Photos
create index listing_images_listing_idx     on listing_images (listing_id, order_index);

-- Saved
create index saved_listings_user_idx        on saved_listings (user_id);

-- Views
create index listing_views_listing_idx      on listing_views (listing_id);

-- Full-text search
create index listings_fts_idx on listings
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') ||
             ' ' || coalesce(make, '') || ' ' || coalesce(model, '')));
```

### Triggers

```sql
-- Auto-update updated_at
create or replace function update_listing_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger listings_updated_at
  before update on listings
  for each row execute function update_listing_timestamp();

-- Sync save_count when saved_listings changes
create or replace function sync_listing_save_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update listings set save_count = save_count + 1 where id = new.listing_id;
  elsif TG_OP = 'DELETE' then
    update listings set save_count = greatest(save_count - 1, 0) where id = old.listing_id;
  end if;
  return null;
end;
$$;

create trigger sync_save_count
  after insert or delete on saved_listings
  for each row execute function sync_listing_save_count();
```

---

## RPC Functions

```sql
-- -----------------------------------------------------------------
-- SEARCH LISTINGS
-- Returns paginated listings with distance, is_saved, seller summary.
-- Cursor-based pagination using (created_at, id).
-- Distance in MILES (3959 = Earth radius in miles).
-- -----------------------------------------------------------------
create or replace function search_listings(
  p_category        text       default null,
  p_make            text       default null,
  p_model           text       default null,
  p_year_min        int        default null,
  p_year_max        int        default null,
  p_price_min       int        default null,  -- cents
  p_price_max       int        default null,  -- cents
  p_mileage_max     int        default null,
  p_condition       text[]     default null,
  p_trade_only      bool       default false,
  p_lat             float      default null,
  p_lng             float      default null,
  p_radius_miles    float      default null,
  p_search_term     text       default null,
  p_sort            text       default 'newest',  -- newest | price_asc | price_desc | mileage_asc
  p_cursor_date     timestamptz default null,
  p_cursor_id       uuid       default null,
  p_limit           int        default 20,
  p_current_user_id uuid       default null
)
returns table (
  id               uuid,
  seller_id        uuid,
  seller_username  text,
  seller_photo     text,
  seller_verified  bool,
  seller_member_since timestamptz,
  category         text,
  year             int,
  make             text,
  model            text,
  trim             text,
  color            text,
  mileage          int,
  condition        text,
  title            text,
  price            int,
  price_type       text,
  trade_considered bool,
  city             text,
  state            text,
  distance_miles   float,
  cover_image_path text,
  view_count       int,
  save_count       int,
  is_saved         bool,
  published_at     timestamptz,
  expires_at       timestamptz,
  created_at       timestamptz
)
language plpgsql security definer as $$
begin
  return query
  select
    l.id,
    l.seller_id,
    p.username,
    p.profile_photo_url,
    (p.phone_verified_at is not null),
    p.created_at                                            as seller_member_since,
    l.category,
    l.year,
    l.make,
    l.model,
    l.trim,
    l.color,
    l.mileage,
    l.condition,
    l.title,
    l.price,
    l.price_type,
    l.trade_considered,
    l.city,
    l.state,
    -- Haversine distance (miles)
    case
      when p_lat is not null and p_lng is not null and l.latitude is not null and l.longitude is not null then
        3959 * acos(
          cos(radians(p_lat)) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(l.latitude))
        )
      else null
    end                                                     as distance_miles,
    (
      select li.storage_path
      from listing_images li
      where li.listing_id = l.id
      order by li.order_index asc
      limit 1
    )                                                       as cover_image_path,
    l.view_count,
    l.save_count,
    (
      select exists(
        select 1 from saved_listings sl
        where sl.listing_id = l.id and sl.user_id = p_current_user_id
      )
    )                                                       as is_saved,
    l.published_at,
    l.expires_at,
    l.created_at
  from listings l
  join profiles p on p.id = l.seller_id
  where
    l.status = 'active'
    and l.deleted_at is null
    and (l.expires_at is null or l.expires_at > now())
    -- Exclude banned/deactivated sellers (shadow ban)
    and p.status = 'active'
    and p.deactivated_at is null
    -- Category filter
    and (p_category is null or l.category = p_category)
    -- Make / model
    and (p_make is null or lower(l.make) = lower(p_make))
    and (p_model is null or lower(l.model) = lower(p_model))
    -- Year range
    and (p_year_min is null or l.year >= p_year_min)
    and (p_year_max is null or l.year <= p_year_max)
    -- Price range
    and (p_price_min is null or l.price >= p_price_min)
    and (p_price_max is null or l.price <= p_price_max)
    -- Mileage
    and (p_mileage_max is null or l.mileage <= p_mileage_max)
    -- Condition (array)
    and (p_condition is null or l.condition = any(p_condition))
    -- Trade filter
    and (not p_trade_only or l.trade_considered = true)
    -- Full-text search
    and (
      p_search_term is null or
      to_tsvector('english', coalesce(l.title,'') || ' ' || coalesce(l.description,'') ||
                             ' ' || l.make || ' ' || l.model)
      @@ plainto_tsquery('english', p_search_term)
    )
    -- Geo radius filter (miles)
    and (
      p_lat is null or p_lng is null or p_radius_miles is null or
      (l.latitude is not null and l.longitude is not null and
       3959 * acos(
         cos(radians(p_lat)) * cos(radians(l.latitude)) *
         cos(radians(l.longitude) - radians(p_lng)) +
         sin(radians(p_lat)) * sin(radians(l.latitude))
       ) <= p_radius_miles)
    )
    -- Cursor pagination
    and (
      p_cursor_date is null or p_cursor_id is null or
      (l.created_at, l.id) < (p_cursor_date, p_cursor_id)
    )
  order by
    case when p_sort = 'price_asc'    then l.price       end asc  nulls last,
    case when p_sort = 'price_desc'   then l.price       end desc nulls last,
    case when p_sort = 'mileage_asc'  then l.mileage     end asc  nulls last,
    l.created_at desc,
    l.id desc
  limit p_limit;
end;
$$;


-- -----------------------------------------------------------------
-- PUBLISH LISTING
-- Validates member eligibility, enforces 3-listing limit, sets lifecycle fields.
-- -----------------------------------------------------------------
create or replace function publish_listing(p_listing_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_seller_id         uuid;
  v_phone_verified    bool;
  v_active_count      int;
begin
  -- Confirm ownership
  select seller_id into v_seller_id from listings where id = p_listing_id;
  if v_seller_id is distinct from auth.uid() then
    raise exception 'Unauthorized';
  end if;

  -- Confirm SMS verification
  select (phone_verified_at is not null) into v_phone_verified
  from profiles where id = auth.uid();
  if not v_phone_verified then
    raise exception 'Phone verification required to publish listings';
  end if;

  -- Enforce 3-listing limit
  select count(*) into v_active_count
  from listings
  where seller_id = auth.uid()
    and status = 'active'
    and id != p_listing_id;
  if v_active_count >= 3 then
    raise exception 'You already have 3 active listings. Mark one as sold or delete it first.';
  end if;

  -- Publish
  update listings
  set
    status       = 'active',
    published_at = now(),
    expires_at   = now() + interval '90 days'
  where id = p_listing_id;
end;
$$;


-- -----------------------------------------------------------------
-- INCREMENT LISTING VIEW
-- Atomic view counter with basic deduplication (same viewer, same hour).
-- -----------------------------------------------------------------
create or replace function increment_listing_view(
  p_listing_id uuid,
  p_viewer_id  uuid default null
)
returns void
language plpgsql security definer as $$
begin
  -- Deduplicate: skip if same viewer viewed this listing in the last hour
  if p_viewer_id is not null then
    if exists (
      select 1 from listing_views
      where listing_id = p_listing_id
        and viewer_id = p_viewer_id
        and created_at > now() - interval '1 hour'
    ) then
      return;
    end if;
  end if;

  insert into listing_views (listing_id, viewer_id)
  values (p_listing_id, p_viewer_id);

  update listings set view_count = view_count + 1
  where id = p_listing_id;
end;
$$;


-- -----------------------------------------------------------------
-- RENEW LISTING
-- Resets expiration to 90 days from now. Owner only.
-- -----------------------------------------------------------------
create or replace function renew_listing(p_listing_id uuid)
returns void
language plpgsql security definer as $$
begin
  update listings
  set
    status                = 'active',
    expires_at            = now() + interval '90 days',
    renewal_email_sent_at = null
  where id = p_listing_id
    and seller_id = auth.uid()
    and status in ('active', 'expired');

  if not found then
    raise exception 'Listing not found or cannot be renewed';
  end if;
end;
$$;


-- -----------------------------------------------------------------
-- MARK LISTING SOLD
-- -----------------------------------------------------------------
create or replace function mark_listing_sold(p_listing_id uuid)
returns void
language plpgsql security definer as $$
begin
  update listings
  set status = 'sold', sold_at = now()
  where id = p_listing_id
    and seller_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Listing not found or not active';
  end if;
end;
$$;


-- -----------------------------------------------------------------
-- EXPIRE LISTINGS (called by a Supabase Cron job, daily)
-- -----------------------------------------------------------------
create or replace function expire_listings()
returns void
language plpgsql security definer as $$
begin
  update listings
  set status = 'expired'
  where status = 'active'
    and expires_at <= now();
end;
$$;


-- -----------------------------------------------------------------
-- FLAG LISTINGS FOR RENEWAL EMAIL (called by Cron, daily)
-- Returns listings that expire in 7 days and haven't had a renewal email sent.
-- The Edge Function consuming this result sends the emails via Resend.
-- -----------------------------------------------------------------
create or replace function get_listings_needing_renewal_email()
returns table (
  listing_id   uuid,
  seller_email text,
  seller_name  text,
  listing_title text,
  expires_at   timestamptz
)
language plpgsql security definer as $$
begin
  return query
  select
    l.id,
    u.email,
    p.first_name,
    l.title,
    l.expires_at
  from listings l
  join profiles p on p.id = l.seller_id
  join auth.users u on u.id = l.seller_id
  where l.status = 'active'
    and l.expires_at between now() and now() + interval '7 days'
    and l.renewal_email_sent_at is null;
end;
$$;
```

---

## Storage Bucket

```
classifieds/          <- new bucket, public read
  {listing_id}/
    {image_id}.jpg    <- compressed client-side via compressImage(), max 1200px
```

### Bucket Policy

```sql
-- Public read (listings are public)
create policy "classifieds_public_read"
  on storage.objects for select
  using (bucket_id = 'classifieds');

-- Authenticated upload to own listing folder
create policy "classifieds_owner_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'classifieds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner can delete their own images
create policy "classifieds_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'classifieds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## TypeScript Types

```typescript
// src/lib/supabase/types.ts (add to existing file)

export type ListingStatus = 'draft' | 'active' | 'sold' | 'expired' | 'removed'

export type ListingCategory =
  | 'cruiser'
  | 'touring_bagger'
  | 'trike'
  | 'sport_naked'
  | 'dirt_offroad'
  | 'dual_sport_adventure'
  | 'custom_chopper'
  | 'vintage_classic'
  | 'scooter_moped'
  | 'other'

export type ListingCondition = 'excellent' | 'good' | 'fair' | 'project'
export type PriceType = 'fixed' | 'obo' | 'offer'

export interface Listing {
  id: string
  seller_id: string
  user_bike_id: string | null
  status: ListingStatus
  category: ListingCategory
  year: number
  make: string
  model: string
  trim: string | null
  color: string | null
  vin: string | null
  mileage: number | null
  condition: ListingCondition
  modifications: string | null
  title: string
  description: string | null
  price: number | null          // cents
  price_type: PriceType
  trade_considered: boolean
  zip_code: string
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  show_phone: boolean
  view_count: number
  save_count: number
  published_at: string | null
  expires_at: string | null
  sold_at: string | null
  created_at: string
  updated_at: string
}

export interface ListingImage {
  id: string
  listing_id: string
  storage_path: string
  order_index: number
  created_at: string
}

// Search result row (from search_listings RPC)
export interface ListingSearchResult {
  id: string
  seller_id: string
  seller_username: string
  seller_photo: string | null
  seller_verified: boolean
  seller_member_since: string
  category: ListingCategory
  year: number
  make: string
  model: string
  trim: string | null
  color: string | null
  mileage: number | null
  condition: ListingCondition
  title: string
  price: number | null
  price_type: PriceType
  trade_considered: boolean
  city: string | null
  state: string | null
  distance_miles: number | null
  cover_image_path: string | null
  view_count: number
  save_count: number
  is_saved: boolean
  published_at: string | null
  expires_at: string | null
  created_at: string
}

// Detail view (fetched via server action, not RPC — mutual friends computed in JS)
export interface ListingDetail extends Listing {
  seller_username: string
  seller_first_name: string
  seller_last_name: string
  seller_photo: string | null
  seller_verified: boolean
  seller_member_since: string
  seller_listings_sold: number
  is_saved: boolean
  is_own_listing: boolean
  mutual_friend_count: number
  images: ListingImage[]
}

// Seller dashboard row
export interface MyListing extends Listing {
  images: ListingImage[]
  message_count: number
}

// Create / edit form state
export interface ListingFormState {
  // Step 1 -- Bike
  user_bike_id: string | null
  category: ListingCategory | ''
  year: number | ''
  make: string
  model: string
  trim: string
  color: string
  // Step 2 -- Condition
  condition: ListingCondition | ''
  mileage: number | ''
  vin: string
  modifications: string
  // Step 3 -- Description & Price
  title: string
  description: string
  price_type: PriceType
  price: number | ''
  trade_considered: boolean
  // Step 4 -- Photos
  images: File[]
  existing_image_paths: string[]
  // Step 5 -- Location
  zip_code: string
  show_phone: boolean
  expires_in_days: 30 | 60 | 90
}

export interface ClassifiedsSearchFilters {
  category?: ListingCategory
  make?: string
  model?: string
  year_min?: number
  year_max?: number
  price_min?: number            // cents
  price_max?: number            // cents
  mileage_max?: number
  condition?: ListingCondition[]
  trade_only?: boolean
  radius_miles?: number
  search_term?: string
  sort: 'newest' | 'price_asc' | 'price_desc' | 'mileage_asc'
}

// Constants
export const LISTING_CATEGORIES: Record<ListingCategory, string> = {
  cruiser:                'Cruiser',
  touring_bagger:         'Touring / Bagger',
  trike:                  'Trike / Three-Wheeler',
  sport_naked:            'Sport / Naked',
  dirt_offroad:           'Dirt / Off-Road',
  dual_sport_adventure:   'Dual-Sport / Adventure',
  custom_chopper:         'Custom / Chopper',
  vintage_classic:        'Vintage / Classic',
  scooter_moped:          'Scooter / Moped',
  other:                  'Other',
}

export const LISTING_CONDITIONS: Record<ListingCondition, { label: string; description: string }> = {
  excellent: { label: 'Excellent',    description: 'Like new. No mechanical issues, minimal cosmetic wear.' },
  good:      { label: 'Good',         description: 'Well maintained. Minor cosmetic wear, fully functional.' },
  fair:      { label: 'Fair',         description: 'Rideable with some wear or minor issues needing attention.' },
  project:   { label: 'Project Bike', description: 'Needs work. Good for restoration or parts.' },
}

export const MAX_LISTING_IMAGES = 24
export const MAX_LISTINGS_PER_USER = 3
export const LISTING_DURATION_DAYS = 90
export const RENEWAL_WARNING_DAYS = 7
```

---

## Server Actions

All classifieds logic lives in `src/app/actions/classifieds.ts` using the same `'use server'` + `getServiceClient()` pattern used throughout the codebase. No route handlers.

### Key Actions

```
createListing(formData)       Create draft listing, geocode zip via geocodeZip()
updateListing(id, formData)   Update listing fields, re-geocode if zip changed
publishListing(id)            Validate eligibility, enforce 3-listing limit, set active
markAsSold(id)                Set status to 'sold'
deleteListing(id)             Soft-delete (set deleted_at)
renewListing(id)              Reset expiration to 90 days
uploadListingImages(id, files) Compress client-side, upload to classifieds bucket
deleteListingImage(id)        Remove from storage + listing_images table
reorderListingImages(id, ordered_ids)  Update order_index values
saveListing(id)               Add to saved_listings
unsaveListing(id)             Remove from saved_listings
recordView(id)                Deduplicated view tracking
getListingDetail(id)          Full listing + seller info + mutual friends (computed in JS)
getMyListings()               All seller's listings grouped by status
getSavedListings()            Buyer's watchlist
searchListings(filters)       Calls search_listings RPC
```

### Listing Detail — Mutual Friends

Mutual friend count is computed in the server action (not in SQL) using the same
pattern as `getMutualFriends()` in `src/app/actions/suggestions.ts`:

```typescript
// In getListingDetail server action:
// 1. Get current user's friend IDs
// 2. Get seller's friend IDs
// 3. Intersect the two sets
// 4. Return count
```

This avoids the complex/incorrect self-join that was in the original RPC approach.

### Phone Number Display

When `show_phone` is true on a listing, the server action reads `phone_number`
from the seller's `profiles` row. There is no separate `phone` column on the
`listings` table — the phone number is always the seller's verified number.

---

## Component Tree

```
app/classifieds/
├── layout.tsx                          <- ClassifiedsLayout (nav context)
├── page.tsx                            <- Browse page
├── [id]/
│   ├── page.tsx                        <- Listing detail
│   └── edit/
│       └── page.tsx                    <- Edit listing (reuses CreateListingWizard)
├── new/
│   └── page.tsx                        <- Create listing
├── my-listings/
│   └── page.tsx                        <- Seller dashboard
├── saved/
│   └── page.tsx                        <- Buyer watchlist
└── seller/
    └── [username]/
        └── page.tsx                    <- Seller public page

components/classifieds/
├── browse/
│   ├── ClassifiedsBrowsePage.tsx       <- Orchestrates filters + grid
│   ├── ListingGrid.tsx                 <- Responsive grid w/ infinite scroll
│   ├── ListingCard.tsx                 <- Listing card (photo, price, meta, save btn)
│   ├── ListingCardSkeleton.tsx         <- Loading shimmer
│   ├── FilterPanel.tsx                 <- Desktop sidebar / mobile bottom sheet
│   ├── FilterChips.tsx                 <- Active filter pills (tapable to remove)
│   ├── SortBar.tsx                     <- Sort dropdown + result count
│   └── EmptySearchState.tsx            <- No results with reset suggestion
│
├── detail/
│   ├── ListingDetailPage.tsx           <- Orchestrator
│   ├── ListingPhotoGallery.tsx         <- Hero photo + thumbnail strip + lightbox
│   ├── ListingPhotoLightbox.tsx        <- Fullscreen viewer with swipe
│   ├── ListingPriceBadge.tsx           <- Price / OBO / Make Offer display
│   ├── ListingSpecGrid.tsx             <- Mileage / Condition / Year / Color grid
│   ├── ListingDescription.tsx          <- Description with "Show more" truncation
│   ├── SellerCard.tsx                  <- Seller avatar, stats, verified badge, contact CTA
│   ├── MutualFriendsBadge.tsx          <- "2 friends know this seller"
│   ├── SimilarListings.tsx             <- Horizontal scroll of related listings
│   ├── ListingActionBar.tsx            <- Save / Share / Report
│   └── ContactSellerButton.tsx         <- Opens DM with pre-filled template
│
├── create/
│   ├── CreateListingWizard.tsx         <- Step coordinator, progress bar, draft save
│   ├── steps/
│   │   ├── Step1Bike.tsx              <- Garage import or manual NHTSA entry
│   │   ├── Step2Condition.tsx         <- Condition, mileage, VIN, mods
│   │   ├── Step3Description.tsx       <- Title, description, price, trade toggle
│   │   ├── Step4Photos.tsx            <- Drag-reorder photo upload
│   │   └── Step5Location.tsx          <- Zip, phone opt-in, duration
│   ├── GarageImportPicker.tsx          <- Dropdown of seller's user_bikes
│   ├── PhotoUploadZone.tsx             <- Drop zone + thumbnail grid + reorder
│   ├── PhotoThumbnail.tsx              <- Individual photo with remove/reorder
│   ├── ConditionPicker.tsx             <- Styled radio cards with descriptions
│   ├── PriceTypeSelector.tsx           <- Fixed / OBO / Make Offer toggle
│   └── ListingPreviewCard.tsx          <- Review step preview
│
├── dashboard/
│   ├── MyListingsPage.tsx              <- Orchestrator with tabs
│   ├── MyListingsTabs.tsx              <- Active / Sold / Expired / Drafts
│   ├── MyListingRow.tsx                <- Row: photo, title, stats, actions menu
│   ├── ListingStatsRow.tsx             <- Views / Saves / Messages counts
│   └── EmptyListingsState.tsx          <- "List your bike" CTA
│
├── saved/
│   ├── SavedListingsPage.tsx           <- Watchlist grid
│   └── SavedListingCard.tsx            <- Card with "SOLD" overlay handling
│
├── seller/
│   └── SellerPublicPage.tsx            <- Seller profile card + listings grid
│
└── shared/
    ├── SaveButton.tsx                  <- Heart toggle, optimistic, auth gate
    ├── SmsVerificationGate.tsx         <- Reuses PhoneVerifyForm from src/app/components/
    ├── ListingStatusBadge.tsx          <- Active / Sold / Expired / Draft pill
    ├── PriceDisplay.tsx                <- Formats cents -> "$22,500" / "OBO" / "Make Offer"
    ├── DistanceBadge.tsx               <- "34 miles away"
    ├── DaysListedBadge.tsx             <- "Listed 3 days ago" / "Expires in 7 days"
    └── ReportListingModal.tsx          <- Reason picker + submit
```

---

## Page Specs

### `/classifieds` -- Browse

**State:** URL search params drive all filter state. On load, parse params ->
populate `ClassifiedsSearchFilters` -> call `searchListings` server action (which
calls the `search_listings` RPC). Changing any filter updates the URL (no full
navigation -- use `router.replace`). This makes searches bookmarkable and
shareable and gives correct browser back behavior.

**Infinite scroll:** Use IntersectionObserver on a sentinel div at the bottom of
the grid. When visible, call `loadNextPage()` which passes the last result's
`(created_at, id)` as cursor.

**Filter panel -- Mobile:** Centered modal (matching project convention -- never
bottom sheet due to iOS Safari toolbar issues). Triggered by "Filters" button in
sort bar. "Apply" closes modal and fires search. Active filter count badge on
the button.

**Filter panel -- Desktop (lg+):** Fixed left sidebar, filters apply on change with
300ms debounce for range sliders.

**Distance filter:** Only shown if the user's profile has lat/lng. Pass user's
`latitude`/`longitude` from profile to search. Uses miles.

**"Sell Your Bike" CTA:** Sticky in the top-right of the page. On click:
- If not authenticated -> login modal
- If authenticated but not SMS verified -> `SmsVerificationGate` (reuses `PhoneVerifyForm`)
- If verified but has 3 active listings -> show message with links to manage listings
- If eligible -> navigate to `/classifieds/new`

---

### `/classifieds/[id]` -- Listing Detail

**On mount:**
1. Call `getListingDetail(id)` server action
2. Call `recordView(id)` via `after()` from `next/server` (fire and forget, like AI scam scan)
3. Images come with the listing detail response

**Photo gallery:**
- First image: full-width hero (aspect ratio 4:3, `object-cover`)
- Thumbnail strip below: horizontal scroll, max 8 visible, tap to change hero
- Count badge overlaid on hero ("1 / 14")
- Click hero -> `ListingPhotoLightbox` (full screen, swipe, zoom)

**"Contact Seller" behavior:**
```typescript
async function handleContact() {
  // 1. Check if conversation already exists
  const existing = await getConversationWithUser(listing.seller_id)
  if (existing) {
    router.push(`/messages/${existing.id}`)
    return
  }
  // 2. Create new conversation pre-seeded with template message
  const template =
    `Hi ${listing.seller_first_name}, I'm interested in your ` +
    `${listing.year} ${listing.make} ${listing.model} listed on BikerOrNot. ` +
    `Is it still available?`

  const conversation = await createConversation(listing.seller_id, template)
  router.push(`/messages/${conversation.id}`)
}
```

**"Similar Listings" section:** Call `searchListings` with same `make` + `category`,
excluding current listing, limit 6. Shown as horizontal scroll at bottom of page.

**Sold listings:** If `status === 'sold'`, show a "SOLD" banner across the hero image.
Keep the page live for 30 days post-sale (social proof, price reference). After 30
days, show "This listing is no longer available" placeholder.

---

### `/classifieds/new` -- Create Listing

**Auth gate (in order):**
1. Not authenticated -> redirect to login with `returnUrl=/classifieds/new`
2. Authenticated but email not confirmed -> "Please verify your email first"
3. Email confirmed but SMS not verified -> `SmsVerificationGate` (reuses `PhoneVerifyForm`)
4. Has 3 active listings -> "You have 3 active listings. [Manage Listings ->]"
5. Eligible -> show wizard

**Draft auto-save:** Every 60 seconds and on step navigation, save the draft via
server action. Uses `localStorage` to store the draft `listing_id` so the user can
resume after closing the browser.

**Step 1 -- Bike:**

"Import from your Garage" card shown first if user has garage bikes. Shows each
bike as a selectable card with photo. On select, auto-fills: category, year, make,
model, color, and pre-loads garage bike photos into Step 4.

If no garage bikes or user clicks "Enter manually," show NHTSA vPIC dropdowns
(reuse `BikeSelector` from `src/app/settings/BikeSelector.tsx`). Category field
is a separate styled radio grid -- not driven by NHTSA.

**Step 4 -- Photos:**

- Drag-to-reorder (use `@dnd-kit/sortable`)
- First image marked with "Cover" badge
- On drop/upload: compress client-side using `compressImage()` from `src/lib/compress.ts`
  (`browser-image-compression`, `useWebWorker: true` -- already configured)
- Minimum 1 photo to advance to Step 5 (can save draft without)
- Show upload progress per image

**Step 5 -- Location:**

Zip code auto-filled from profile. Phone opt-in toggle reads from
`profiles.phone_number`. Duration selector: 30 / 60 / 90 days (90 pre-selected).

**Review screen:**

Shows `ListingPreviewCard` (same as browse card). Checklist of entered data.
"Edit" link per section jumps back to that step. Two buttons:
- **Publish Listing** -> calls `publishListing` server action -> success screen
- **Save as Draft** -> stays in draft status, appears in My Listings -> Drafts tab

---

### `/classifieds/my-listings` -- Seller Dashboard

**Tabs:** Active (with count badge) . Sold . Expired . Drafts

**Active tab -- Per listing actions:**
- Edit -> `/classifieds/[id]/edit`
- Mark as Sold -> centered confirm modal -> calls `markAsSold`
- Share -> Native share sheet / copy link
- Delete -> centered confirm modal (destructive) -> soft-delete

**Expired tab -- Per listing actions:**
- Renew -> calls `renewListing` -> moves to Active tab
- Delete

**Stats row per listing:** Views . Saves . Messages (from DM count)

**Top aggregate bar (Active tab only):** Total views across all active listings .
Total saves . Days until next expiry

---

## SMS Verification Gate

Reuses the existing `PhoneVerifyForm` component from `src/app/components/PhoneVerifyForm.tsx`
(same component used in onboarding and settings). Wrapped in a
`SmsVerificationGate` that shows the verification form inline when an unverified
member tries to create a listing.

After verification, drop the user directly back into the create listing flow.
No page reload required -- invalidate via `router.refresh()` and re-check eligibility.

---

## Expiration Email -- Resend Template

**Trigger:** Supabase Edge Function running on a daily Cron schedule. Calls
`get_listings_needing_renewal_email()`, sends email via Resend, then updates
`renewal_email_sent_at` to prevent duplicate sends.

**Subject:** `Your BikerOrNot listing expires in 7 days`

**Body:**

```
Hi [First Name],

Your listing for your [Year Make Model] expires in 7 days.

If it's still available, renew it in one click to keep it visible
to buyers in your area.

  [ Renew My Listing ]          [ Mark as Sold ]

If you've already sold it, marking it as sold helps build your
seller reputation on BikerOrNot.

-- The BikerOrNot Team
```

---

## Navigation Integration

**Desktop nav header:** Add "Classifieds" link (same pattern as Find Riders, Bikes, Groups).

**Mobile bottom nav:** Consider adding as 5th tab or replacing Bikes tab. TBD based
on usage metrics.

**Profile page:** Below the member stats row, add:
- If viewing own profile and has active listing: "[View Your Listing ->]"
- If viewing another member's profile and they have an active listing:
  "[Bike for Sale ->]" chip that links to their listing

**Garage feature:** On each garage bike in GarageTab, add:
- If no active listing for that bike: "[List This Bike for Sale]" button -> pre-fills wizard
- If active listing exists for that bike: "[View Listing ->]" + price

**Feed integration (post-launch Phase 2):** Weekly "Listings Near You" card in
feed. Triggered by Edge Function, not real-time. Shows 3 nearby listings, links
to browse filtered by user's region.

---

## Admin Moderation

Reported listings use the existing `reports` table with `reported_type = 'listing'`
and `reported_id` set to the listing UUID.

Admin actions on listings (via existing admin panel pattern):
- Remove listing (`status = 'removed'`) -- listing no longer visible
- Warn seller (triggers DM from system account)
- Suspend seller (sets profile status -- existing mechanism)

---

## Monetization Hooks (Not Built Now -- Schema Ready)

Add these columns to listings when ready (not at launch):

| Column | Purpose |
|---|---|
| `is_featured bool` | Featured listings shown first in search, "Featured" badge on card |
| `bumped_at timestamptz` | Reset to now() -> moves listing to top of "Newest" sort |

**Planned monetization tiers (post-launch):**
- **Listing bump** -- $1.99, resets `bumped_at`, moves to top of Newest for 7 days
- **Featured badge** -- $4.99/month, shown before non-featured in search results
- **Unlimited listings** -- $9.99/month, removes the 3-listing cap (dealer tier)

---

## Parts & Accessories Extension (Deferred)

When added, the schema extends cleanly by adding:

```sql
-- New column on listings table (no breaking changes)
alter table listings add column listing_type text not null default 'motorcycle'
  check (listing_type in ('motorcycle', 'part', 'accessory', 'gear'));

-- Parts: no year/make/model required; instead "fits these bikes"
alter table listings add column fits_makes text[];  -- ['Harley-Davidson', 'Indian']
```

Different create wizard steps for parts (no NHTSA lookup, different category
taxonomy), but same search, save, DM contact, and seller dashboard infrastructure.

---

## Reuse Existing Infrastructure

| What | Where | How Used |
|---|---|---|
| `geocodeZip()` | `src/lib/geocode.ts` | Zip -> lat/lng on listing create/edit |
| `haversine()` | `src/lib/geo.ts` | Client-side distance display |
| `compressImage()` | `src/lib/compress.ts` | Client-side photo compression before upload |
| `BikeSelector` | `src/app/settings/BikeSelector.tsx` | NHTSA make/model picker in Step 1 |
| `PhoneVerifyForm` | `src/app/components/PhoneVerifyForm.tsx` | SMS verification gate |
| `getServiceClient()` | Pattern in all server actions | Admin DB writes |
| `validateImageFile()` | `src/lib/rate-limit.ts` | Image validation |
| `moderateImage()` | `src/lib/sightengine.ts` | Content moderation on listing photos |
| `getImageUrl()` | `src/lib/supabase/image.ts` | Render listing/seller photos |
| `after()` | `next/server` | Fire-and-forget view tracking |
| `VerifiedBadge` | `src/app/components/VerifiedBadge.tsx` | Show on seller cards |
| `ContentMenu` | `src/app/components/ContentMenu.tsx` | Report listing |

---

## Phased Build Plan

### Phase 1 -- Core (Launch With)
- Database schema + indexes + triggers + RPC functions
- Storage bucket + policies
- Server actions (`src/app/actions/classifieds.ts`)
- `/classifieds` browse page with filters, sorting, infinite scroll
- `/classifieds/[id]` listing detail with photo gallery and contact seller DM flow
- `/classifieds/new` create wizard (manual entry + Garage import)
- `/classifieds/my-listings` Active + Sold + Drafts tabs
- Save / unsave (watchlist)
- SMS verification gate (reuses PhoneVerifyForm)
- Admin report flow
- Nav integration

### Phase 2 -- Shortly After Launch
- `/classifieds/saved` watchlist browse page
- `/classifieds/seller/[username]` seller public page
- Expiration email via Resend + Cron
- Renew listing
- Expired tab in My Listings
- Profile page listing integration
- Garage bike "List for Sale" button

### Phase 3 -- Post-Traction
- Feed "Listings Near You" cards (weekly, Edge Function)
- Seller response rate badge (calculated from DM response time)
- Featured / Bump monetization
- Parts & accessories listing type

---

## Pre-Build Checklist

```
[x] profiles table has phone_verified_at and phone_number columns
[x] user_bikes table confirmed (for Garage import pre-fill)
[x] BikeSelector NHTSA component built -- reusable from src/app/settings/BikeSelector.tsx
[x] geocodeZip() working in src/lib/geocode.ts (zippopotam.us, free, no key)
[x] compressImage() working in src/lib/compress.ts (browser-image-compression)
[x] PhoneVerifyForm component built and tested
[x] DM system supports conversation creation with initial message
[x] Admin moderation backend accepts reports (reports table)
[x] VerifiedBadge component available
[x] haversine() shared in src/lib/geo.ts
[ ] Supabase Cron enabled on project (for expiration + renewal email jobs)
[ ] classifieds Storage bucket created, public read enabled
[ ] Resend expiration email template drafted
```

---

*BikerOrNot Classifieds -- Motorcycles only . Phase 1-3 . Shared Supabase backend*
