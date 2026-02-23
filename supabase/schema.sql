-- ============================================================
-- BikerOrNot — Phase 1 Database Schema
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- ============================================================

-- ─────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  zip_code text not null,
  relationship_status text check (
    relationship_status in ('single', 'in_a_relationship', 'its_complicated')
  ),
  display_name text,
  bio text,
  location text,
  riding_style text[],
  profile_photo_url text,
  cover_photo_url text,
  status text default 'active' check (status in ('active', 'suspended', 'banned')),
  role text default 'user' check (role in ('user', 'moderator', 'admin')),
  onboarding_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- USER BIKES
-- ─────────────────────────────────────────
create table public.user_bikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  year int,
  make text,
  model text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- AUTO-UPDATE updated_at ON profiles
-- ─────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ─────────────────────────────────────────
-- TRIGGER: auto-create profile on signup
-- ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    date_of_birth,
    zip_code,
    relationship_status
  )
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    (new.raw_user_meta_data->>'date_of_birth')::date,
    new.raw_user_meta_data->>'zip_code',
    new.raw_user_meta_data->>'relationship_status'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_bikes enable row level security;

-- profiles: public read of non-sensitive fields
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- profiles: users can update only their own row
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- profiles: insert handled by trigger (service role), not direct client insert
-- (No insert policy needed for regular users)

-- user_bikes: owner can read/write their own bikes
create policy "Users can view own bikes"
  on public.user_bikes for select
  using (auth.uid() = user_id);

create policy "Users can insert own bikes"
  on public.user_bikes for insert
  with check (auth.uid() = user_id);

create policy "Users can update own bikes"
  on public.user_bikes for update
  using (auth.uid() = user_id);

create policy "Users can delete own bikes"
  on public.user_bikes for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- STORAGE BUCKETS
-- Run these in Supabase Dashboard → Storage → New bucket
-- OR uncomment and run here if using service role
-- ─────────────────────────────────────────
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
-- insert into storage.buckets (id, name, public) values ('covers', 'covers', true);
-- insert into storage.buckets (id, name, public) values ('posts', 'posts', true);
