-- Update search_listings to support "nearest" sort and "__other__" make filter
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
declare
  v_known_makes text[] := ARRAY[
    'Buell','Harley-Davidson','Indian','Victory','Zero',
    'BSA','Norton','Triumph',
    'BMW',
    'Aprilia','Ducati','Moto Guzzi',
    'Honda','Kawasaki','Suzuki','Yamaha'
  ];
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
    -- Make filter: '__other__' matches any make NOT in curated list
    and (
      p_make is null
      or (p_make = '__other__' and l.make is not null and not (l.make = any(v_known_makes)))
      or (p_make <> '__other__' and lower(l.make) = lower(p_make))
    )
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
    case when p_sort = 'nearest' and p_lat is not null and p_lng is not null then
      case
        when l.latitude is not null and l.longitude is not null then
          3959 * acos(
            least(1.0, greatest(-1.0,
              cos(radians(p_lat)) * cos(radians(l.latitude)) *
              cos(radians(l.longitude) - radians(p_lng)) +
              sin(radians(p_lat)) * sin(radians(l.latitude))
            ))
          )
        else 999999
      end
    end asc nulls last,
    case when p_sort = 'price_asc'    then l.price       end asc  nulls last,
    case when p_sort = 'price_desc'   then l.price       end desc nulls last,
    case when p_sort = 'mileage_asc'  then l.mileage     end asc  nulls last,
    l.created_at desc,
    l.id desc
  limit p_limit;
end;
$$;
