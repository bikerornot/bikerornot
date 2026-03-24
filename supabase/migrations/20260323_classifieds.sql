-- =============================================================
-- CLASSIFIEDS — Motorcycle marketplace
-- =============================================================

-- -----------------------------------------------------------------
-- LISTINGS
-- -----------------------------------------------------------------
create table if not exists listings (
  id                uuid        primary key default gen_random_uuid(),
  seller_id         uuid        not null references profiles(id) on delete cascade,
  user_bike_id      uuid        references user_bikes(id) on delete set null,

  status            text        not null default 'draft'
                    check (status in ('draft', 'active', 'sold', 'expired', 'removed')),

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

  mileage           int         check (mileage is null or mileage >= 0),
  condition         text        not null
                    check (condition in ('excellent', 'good', 'fair', 'project')),
  modifications     text,

  title             text        not null check (length(title) between 5 and 100),
  description       text        check (description is null or length(description) <= 5000),

  price             int         check (price is null or price >= 0),
  price_type        text        not null default 'fixed'
                    check (price_type in ('fixed', 'obo', 'offer')),
  trade_considered  bool        not null default false,

  zip_code          text        not null,
  city              text,
  state             text,
  latitude          float8,
  longitude         float8,

  show_phone        bool        not null default false,

  view_count        int         not null default 0,
  save_count        int         not null default 0,

  published_at      timestamptz,
  expires_at        timestamptz,
  renewal_email_sent_at timestamptz,
  sold_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- -----------------------------------------------------------------
-- LISTING IMAGES
-- -----------------------------------------------------------------
create table if not exists listing_images (
  id            uuid        primary key default gen_random_uuid(),
  listing_id    uuid        not null references listings(id) on delete cascade,
  storage_path  text        not null,
  order_index   int         not null default 0,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------
-- SAVED LISTINGS (buyer watchlist)
-- -----------------------------------------------------------------
create table if not exists saved_listings (
  user_id     uuid        not null references profiles(id) on delete cascade,
  listing_id  uuid        not null references listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- -----------------------------------------------------------------
-- LISTING VIEWS (analytics)
-- -----------------------------------------------------------------
create table if not exists listing_views (
  id          uuid        primary key default gen_random_uuid(),
  listing_id  uuid        not null references listings(id) on delete cascade,
  viewer_id   uuid        references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);


-- =============================================================
-- INDEXES
-- =============================================================
create index if not exists listings_status_expires_idx    on listings (status, expires_at);
create index if not exists listings_seller_idx            on listings (seller_id);
create index if not exists listings_user_bike_idx         on listings (user_bike_id);
create index if not exists listings_category_idx          on listings (category);
create index if not exists listings_make_model_year_idx   on listings (make, model, year);
create index if not exists listings_price_idx             on listings (price);
create index if not exists listings_mileage_idx           on listings (mileage);
create index if not exists listings_condition_idx         on listings (condition);
create index if not exists listings_geo_idx              on listings (latitude, longitude);
create index if not exists listing_images_listing_idx     on listing_images (listing_id, order_index);
create index if not exists saved_listings_user_idx        on saved_listings (user_id);
create index if not exists listing_views_listing_idx      on listing_views (listing_id);

-- Full-text search
create index if not exists listings_fts_idx on listings
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') ||
             ' ' || coalesce(make, '') || ' ' || coalesce(model, '')));


-- =============================================================
-- TRIGGERS
-- =============================================================

-- Auto-update updated_at
create or replace function update_listing_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists listings_updated_at on listings;
create trigger listings_updated_at
  before update on listings
  for each row execute function update_listing_timestamp();

-- Sync save_count on saved_listings changes
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

drop trigger if exists sync_save_count on saved_listings;
create trigger sync_save_count
  after insert or delete on saved_listings
  for each row execute function sync_listing_save_count();


-- =============================================================
-- RPC FUNCTIONS
-- =============================================================

-- -----------------------------------------------------------------
-- SEARCH LISTINGS
-- -----------------------------------------------------------------
create or replace function search_listings(
  p_category        text       default null,
  p_make            text       default null,
  p_model           text       default null,
  p_year_min        int        default null,
  p_year_max        int        default null,
  p_price_min       int        default null,
  p_price_max       int        default null,
  p_mileage_max     int        default null,
  p_condition       text[]     default null,
  p_trade_only      bool       default false,
  p_lat             float      default null,
  p_lng             float      default null,
  p_radius_miles    float      default null,
  p_search_term     text       default null,
  p_sort            text       default 'newest',
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
  "year"           int,
  "make"           text,
  "model"          text,
  "trim"           text,
  color            text,
  mileage          int,
  "condition"      text,
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
    case
      when p_lat is not null and p_lng is not null and l.latitude is not null and l.longitude is not null then
        3959 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(p_lat)) * cos(radians(l.latitude)) *
            cos(radians(l.longitude) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(l.latitude))
          ))
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
    and p.status = 'active'
    and p.deactivated_at is null
    and (p_category is null or l.category = p_category)
    and (p_make is null or lower(l.make) = lower(p_make))
    and (p_model is null or lower(l.model) = lower(p_model))
    and (p_year_min is null or l.year >= p_year_min)
    and (p_year_max is null or l.year <= p_year_max)
    and (p_price_min is null or l.price >= p_price_min)
    and (p_price_max is null or l.price <= p_price_max)
    and (p_mileage_max is null or l.mileage <= p_mileage_max)
    and (p_condition is null or l.condition = any(p_condition))
    and (not p_trade_only or l.trade_considered = true)
    and (
      p_search_term is null or
      to_tsvector('english', coalesce(l.title,'') || ' ' || coalesce(l.description,'') ||
                             ' ' || l.make || ' ' || l.model)
      @@ plainto_tsquery('english', p_search_term)
    )
    and (
      p_lat is null or p_lng is null or p_radius_miles is null or
      (l.latitude is not null and l.longitude is not null and
       3959 * acos(
         least(1.0, greatest(-1.0,
           cos(radians(p_lat)) * cos(radians(l.latitude)) *
           cos(radians(l.longitude) - radians(p_lng)) +
           sin(radians(p_lat)) * sin(radians(l.latitude))
         ))
       ) <= p_radius_miles)
    )
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
-- -----------------------------------------------------------------
create or replace function publish_listing(p_listing_id uuid, p_seller_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_owner_id          uuid;
  v_phone_verified    bool;
  v_active_count      int;
begin
  select seller_id into v_owner_id from listings where id = p_listing_id;
  if v_owner_id is distinct from p_seller_id then
    raise exception 'Unauthorized';
  end if;

  select (phone_verified_at is not null) into v_phone_verified
  from profiles where id = p_seller_id;
  if not v_phone_verified then
    raise exception 'Phone verification required to publish listings';
  end if;

  select count(*) into v_active_count
  from listings
  where seller_id = p_seller_id
    and status = 'active'
    and id != p_listing_id;
  if v_active_count >= 3 then
    raise exception 'You already have 3 active listings. Mark one as sold or delete it first.';
  end if;

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
-- -----------------------------------------------------------------
create or replace function increment_listing_view(
  p_listing_id uuid,
  p_viewer_id  uuid default null
)
returns void
language plpgsql security definer as $$
begin
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
-- -----------------------------------------------------------------
create or replace function renew_listing(p_listing_id uuid, p_seller_id uuid)
returns void
language plpgsql security definer as $$
begin
  update listings
  set
    status                = 'active',
    expires_at            = now() + interval '90 days',
    renewal_email_sent_at = null
  where id = p_listing_id
    and seller_id = p_seller_id
    and status in ('active', 'expired');

  if not found then
    raise exception 'Listing not found or cannot be renewed';
  end if;
end;
$$;


-- -----------------------------------------------------------------
-- MARK LISTING SOLD
-- -----------------------------------------------------------------
create or replace function mark_listing_sold(p_listing_id uuid, p_seller_id uuid)
returns void
language plpgsql security definer as $$
begin
  update listings
  set status = 'sold', sold_at = now()
  where id = p_listing_id
    and seller_id = p_seller_id
    and status = 'active';

  if not found then
    raise exception 'Listing not found or not active';
  end if;
end;
$$;


-- -----------------------------------------------------------------
-- EXPIRE LISTINGS (cron job, daily)
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
-- FLAG LISTINGS FOR RENEWAL EMAIL (cron job, daily)
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


-- =============================================================
-- STORAGE BUCKET POLICIES
-- =============================================================
-- Note: The bucket 'classifieds' must be created in the Supabase dashboard.
-- These policies assume it exists.

-- Public read
create policy "classifieds_public_read"
  on storage.objects for select
  using (bucket_id = 'classifieds');

-- Authenticated upload
create policy "classifieds_owner_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'classifieds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Owner delete
create policy "classifieds_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'classifieds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
