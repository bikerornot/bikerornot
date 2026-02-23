# 🏍️ Biker Social Network — Feature Outline v3
*Stack: Supabase Free → Pro · Next.js · TanStack Query · Tailwind CSS · Resend Free → Pro · Vercel Pro (required at launch) · Vercel Analytics*

---

## 💰 Cost Strategy: Free Tier Until Launch

Use this as your spend roadmap. The goal is $0/month during development, then a controlled step up at launch.

| Service | During Development | At Launch | Upgrade Trigger |
|---|---|---|---|
| **Supabase** | ✅ Free | ✅ Free (if under limits) | Upgrade to Pro ($25/mo) before inviting real users — eliminates 7-day pause risk |
| **Vercel** | ✅ Hobby (free, personal use) | ⚠️ **Must upgrade to Pro ($20/mo)** | Hobby plan prohibits commercial/public apps — required at launch |
| **Resend** | ✅ Free (3,000 emails/mo, 100/day) | ✅ Free (early users) | Upgrade to Pro ($20/mo) when daily signups approach 80–90/day |
| **Next.js** | ✅ Free (open source) | ✅ Free | Never |
| **Tailwind CSS** | ✅ Free (open source) | ✅ Free | Never |
| **TanStack Query** | ✅ Free (open source) | ✅ Free | Never |
| **Vercel Analytics** | ✅ Free (2,500 events/mo on Hobby) | ✅ Included in Vercel Pro | Included in Pro plan |

### ⚠️ Important Notes on Free Tiers

**Vercel Hobby = Development Only**
Vercel's Terms of Service explicitly restrict the Hobby (free) plan to personal, non-commercial use. You can build and test your app on Hobby, but the moment you open it to the public, you must be on the Pro plan ($20/month). This is the one unavoidable pre-launch cost.

**Supabase Free: The 7-Day Pause**
If your Supabase project receives no API requests for 7 consecutive days, it pauses automatically and goes offline. Your data is safe — but the app is dead until you manually resume it in the dashboard. This is fine during development (you'll be hitting it daily). Upgrade to Supabase Pro ($25/mo) in the same week you launch to real users.

**Resend Free: The 100/Day Cap**
The free tier allows 3,000 emails per month but caps daily sends at 100. During development this is generous. It becomes a bottleneck only when you start getting more than 100 new signups or password resets in a single day. Watch your Resend dashboard when you start inviting users.

**Your Realistic Pre-Launch Monthly Cost: $0**
**Your Realistic Launch-Day Monthly Cost: ~$45/mo** (Vercel Pro $20 + Supabase Pro $25)

---

## ✅ Full Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Framework | Next.js (App Router) | Free |
| Styling | Tailwind CSS | Free |
| State / Data Fetching | TanStack Query v5 | Free |
| Database | Supabase (PostgreSQL) | Free → $25/mo Pro |
| Auth | Supabase Auth | Included in Supabase |
| Email | Resend | Free → $20/mo Pro |
| File Storage | Supabase Storage | Included in Supabase |
| Image Optimization | Next.js Image + Supabase Storage Transformations | Included |
| Realtime | Supabase Realtime | Included in Supabase |
| Search | PostgreSQL Full-Text Search (built into Supabase) | Included |
| Analytics | Vercel Analytics | Included in Vercel plan |
| Hosting | Vercel | Hobby (dev) → Pro $20/mo (launch) |

---

## 1. USER AUTHENTICATION & SIGNUP

### Registration Flow
Supabase Auth handles the core session. Resend delivers the verification email.

**Signup Form Fields:**
- First name (required, max 50 chars)
- Last name (required, max 50 chars)
- Email address (required, must be unique)
- Password (required, min 8 chars, 1 uppercase, 1 number, 1 special character)
- Confirm password
- Date of birth (required — date picker, must be 18+ to register)
- Zip code (required — US 5-digit or international format)
- Relationship status (required — single select radio):
  - 🟢 Single
  - 💑 In a Relationship
  - 🤷 It's Complicated

**Flow:**
1. User submits form → Supabase Auth creates unverified user → Resend delivers branded verification email
2. User clicks link → Supabase Auth verifies token → account activated
3. On first login after verification → redirect to `/onboarding` (pick username, add profile photo, bike info)
4. "Resend verification email" option if link expired (mindful of 100/day Resend cap during early launch)

**Supabase Auth Config:**
- Email confirmations: ON
- Custom SMTP: point to Resend's SMTP credentials in Supabase Auth dashboard settings
- Email templates: Custom-branded HTML built with React Email + Resend

### Login
- Email + password via `supabase.auth.signInWithPassword()`
- Sessions handled automatically by Next.js middleware + Supabase Auth cookies
- "Remember me" — extend session from 1 week to 30 days

### Password Reset
- "Forgot password" → enter email → Resend delivers reset email (token from Supabase Auth)
- Reset link expires in 1 hour
- All active sessions invalidated on reset

### Extended User Profile Table
Supabase Auth manages credentials. A `profiles` table (linked by user UUID) stores all app-level data:

```sql
-- Automatically created by trigger when user signs up
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,                    -- chosen during onboarding
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  zip_code text not null,
  relationship_status text check (
    relationship_status in ('single', 'in_a_relationship', 'its_complicated')
  ),
  display_name text,
  bio text,                                -- max 300 chars
  location text,
  riding_style text[],                     -- array: ['cruiser', 'sport', 'touring', ...]
  profile_photo_url text,
  cover_photo_url text,
  status text default 'active' check (status in ('active', 'suspended', 'banned')),
  role text default 'user' check (role in ('user', 'moderator', 'admin')),
  onboarding_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bikes owned (one-to-many)
create table user_bikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  year int,
  make text,
  model text,
  created_at timestamptz default now()
);

-- Auto-create profile row when a user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, date_of_birth, zip_code, relationship_status)
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
  for each row execute procedure handle_new_user();
```

**Row Level Security (RLS) on profiles:**
- Anyone can read public profile fields
- Only the profile owner can update their own row
- Admin/moderator status updates go through server-side API routes using the service role key only

---

## 2. USER PROFILE PAGE

### Profile Page Layout
- Cover photo (1200×400px — Supabase Storage, served via Next.js `<Image>` + Supabase transformation URL)
- Profile photo (400×400px circle, overlaid on cover)
- Display name + @username
- Bio, location, riding styles, relationship status badge, bikes owned
- Member since date, friend count, post count
- Action buttons (when viewing another's profile): **Add Friend / Pending / Friends** · **Message** · **Block**
- Tabs: **Wall** | **Photos** | **Friends** | **About**

### Profile Photo & Cover Photo Upload
- Upload to Supabase Storage buckets (`avatars/` and `covers/`)
- Serve resized versions via Supabase Storage transformation URL parameters:
  - Avatar small (nav, comments): `?width=80&height=80&resize=cover`
  - Avatar medium (profile page): `?width=200&height=200&resize=cover`
  - Cover photo: `?width=1200&height=400&resize=cover`
- Store only the raw `storage_path` in the DB — generate transformation URLs in a shared utility function
- TanStack Query caches rendered results so transformations aren't re-triggered on every render

### Profile Settings (`/settings`)
- Edit all profile fields (name, bio, location, riding style, bikes, zip, DOB, relationship status)
- Change username (max once every 30 days)
- Change email (triggers re-verification via Resend)
- Change password
- Privacy: profile visibility (public / friends only)
- Notification preferences (email on/off per event type)
- Blocked users list
- Delete account (soft delete — 30-day retention, then hard delete via Supabase cron job or pg_cron)

---

## 3. THE WALL & FEED

### Personal Wall (`/profile/:username`)
- Posts by the profile owner + posts others have written on their wall
- Newest first, paginated (10 posts per page)
- TanStack Query `useInfiniteQuery` with cursor-based pagination using `created_at` as cursor
- Wall owner can delete any post on their wall

### Main Feed (`/`)
- Posts from friends + own posts, newest first
- Same TanStack Query infinite scroll pattern as wall
- Supabase Realtime **Broadcast** channel for new post notifications: show a "New posts available" banner rather than auto-inserting into the feed (less jarring UX)
- Broadcast (fire-and-forget) does not consume Postgres connection quota — important for free tier

### Post Composer
- Textarea (max 2,000 chars, live character counter)
- Attach up to 10 images (jpg, png, gif, webp, max 10MB each — 50MB is the free tier global limit per file, so 10MB is well within bounds)
- Image previews with remove buttons before posting
- Optimistic update via TanStack Query `useMutation` — post appears instantly, rolls back on error
- Upload images to Supabase Storage (`posts/` bucket) before creating the post record

### Post Schema
```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade,
  wall_owner_id uuid references profiles(id) on delete cascade, -- null = main feed post
  content text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  storage_path text not null,
  order_index int default 0
);

create table post_likes (
  user_id uuid references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);
```

### Post Display
- Author avatar (Supabase transformation URL, cached by TanStack Query)
- Author display name + @username + relative timestamp ("2 hours ago")
- Post text content
- Image gallery: single image full-width; 2–4 in grid; lightbox on click
- ❤️ Like + count · 💬 Comment count (click to expand inline)
- `···` menu: Edit / Delete (own posts) · Report (others' posts)

---

## 4. COMMENTS

### Features
- Top-level only (no nested threading in v1)
- Text only, max 1,000 chars
- Like comments
- Delete own comment; post author + wall owner can delete any comment on their content
- Report option on all comments

### Realtime Comments
- Use Supabase Realtime **Postgres Changes** on the `comments` table, filtered by `post_id`
- When a user opens a post's comment section, subscribe to that post's channel
- New comments appear in real time without a page refresh
- TanStack Query cache updated on Realtime insert/delete event — no full refetch needed

### Comment Schema
```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table comment_likes (
  user_id uuid references profiles(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, comment_id)
);
```

---

## 5. FRIEND REQUESTS

### Flow
- User A sends request → `status: 'pending'`
- User B: Accept (→ `status: 'accepted'`) or Decline (row deleted, no notification to A)
- User A can cancel a pending request before B acts
- Unfriend: delete the row — no notification sent
- Block automatically removes any existing friendship

### Schema
```sql
create table friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete cascade,
  addressee_id uuid references profiles(id) on delete cascade,
  status text check (status in ('pending', 'accepted')) default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (requester_id, addressee_id)
);

-- Helper: get friendship status between two users (checks both directions)
create or replace function get_friendship_status(user_a uuid, user_b uuid)
returns text as $$
  select status from friendships
  where (requester_id = user_a and addressee_id = user_b)
     or (requester_id = user_b and addressee_id = user_a)
  limit 1;
$$ language sql;
```

---

## 6. DIRECT MESSAGING

### Features
- Friends only (enforced server-side + RLS)
- Real-time via Supabase Realtime **Postgres Changes** on `messages`, filtered by `conversation_id`
- "Seen" receipt (updated when recipient opens conversation)
- Unread message badge count in nav (TanStack Query + Realtime subscription)
- Delete own message ("This message was deleted" placeholder)
- Text only in v1

### TanStack Query + Realtime Pattern for DMs
```
1. useQuery fetches conversation history on mount
2. Supabase Realtime subscription set up in useEffect
3. On new message Realtime event → queryClient.setQueryData() appends message to cache
4. No full refetch needed — Realtime handles the delta update
5. On conversation open → update last_read_at → clears unread badge
```

### Schema
```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table conversation_participants (
  conversation_id uuid references conversations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now(),
  deleted_at timestamptz
);
```

---

## 7. NOTIFICATIONS

### Trigger Events
| Event | Notification Text |
|---|---|
| Friend request received | **@username** sent you a friend request |
| Friend request accepted | **@username** accepted your friend request |
| Post liked | **@username** liked your post |
| Comment on your post | **@username** commented on your post |
| Post on your wall | **@username** posted on your wall |
| New message | **@username** sent you a message |

### Behavior
- Bell icon in nav with unread count badge
- Dropdown shows last 20 notifications, newest first
- Mark all as read button
- Click notification → navigate to relevant content
- Realtime: Supabase Realtime Postgres Changes on `notifications`, filtered by `recipient_id` — badge updates live
- Email notifications via Resend — configurable per event type in user settings (mindful of 100/day free tier cap)

### Schema
```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete cascade,
  type text check (type in (
    'friend_request', 'friend_accept', 'post_like',
    'comment', 'wall_post', 'message'
  )),
  entity_id uuid,
  entity_type text,
  read boolean default false,
  created_at timestamptz default now()
);

-- Index for fast unread count queries
create index on notifications (recipient_id, read) where read = false;
```

---

## 8. BLOCKING

### Behavior
- Blocker and blocked are hidden from each other's feeds, search results, and profiles
- Existing friendship removed on block
- Pending friend requests cancelled
- Messaging disabled between them
- Blocked user sees "User not found" — no indication they were blocked
- Unblock from Settings → Blocked Users

### Enforcement
- All feed and search queries exclude blocked users via subquery
- Supabase RLS policies enforce this at the database level — even direct API calls are blocked
- Enforced in both directions: if A blocks B, neither sees the other regardless of who initiated

### Schema
```sql
create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);
```

---

## 9. SEARCH (PostgreSQL Full-Text Search)

### Scope (v1)
- Search users by first name, last name, username, display name
- Blocked users excluded from all results
- Results show: avatar, display name, @username, mutual friends count, action button
- Sorted by relevance rank

### Postgres FTS Setup
```sql
-- tsvector column on profiles (auto-updated)
alter table profiles add column search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(username, '') || ' ' ||
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(display_name, '')
    )
  ) stored;

create index on profiles using gin(search_vector);

-- RPC function called from the client via supabase.rpc()
create or replace function search_users(search_term text, current_user_id uuid)
returns setof profiles as $$
  select p.* from profiles p
  where p.search_vector @@ plainto_tsquery('english', search_term)
    and p.id != current_user_id
    and p.id not in (
      select blocked_id from blocks where blocker_id = current_user_id
      union
      select blocker_id from blocks where blocked_id = current_user_id
    )
  order by ts_rank(p.search_vector, plainto_tsquery('english', search_term)) desc
  limit 20;
$$ language sql;
```

### Search UI
- Search bar always visible in top nav (icon-only on mobile, expands on tap)
- Debounced input (300ms) → `supabase.rpc('search_users', { search_term, current_user_id })`
- TanStack Query caches results per unique query string
- Dedicated `/search?q=` page for full results view

---

## 10. IMAGE HANDLING

### Storage Buckets (Supabase Storage — Free Tier: 1GB total)
| Bucket | Contents | Free Tier Impact |
|---|---|---|
| `avatars` | Profile photos | Small — keep thumbnail sizes small |
| `covers` | Cover photos | Moderate — compress before upload |
| `posts` | Post images | Largest consumer — monitor this |

**Free Tier Storage Strategy:**
- Client-side compress images before upload (use `browser-image-compression` npm package)
- Target: compress to under 500KB per image before sending to Supabase Storage
- This stretches your 1GB free limit significantly further
- Monitor storage usage in Supabase dashboard weekly during early launch
- When approaching 800MB → upgrade to Supabase Pro (100GB included)

### Supabase Storage Transformation URL Pattern
```typescript
// Shared utility — call this everywhere instead of building URLs manually
export function getImageUrl(
  bucket: 'avatars' | 'covers' | 'posts',
  path: string,
  options?: { width?: number; height?: number; resize?: 'cover' | 'contain' }
) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
    transform: options
  })
  return data.publicUrl
}

// Usage examples:
getImageUrl('avatars', path, { width: 80, height: 80, resize: 'cover' })   // nav
getImageUrl('avatars', path, { width: 200, height: 200, resize: 'cover' }) // profile
getImageUrl('covers', path, { width: 1200, height: 400, resize: 'cover' }) // cover
getImageUrl('posts', path, { width: 600, resize: 'contain' })              // feed
```

### File Upload Validation (in Next.js API route, server-side)
- Check MIME type from buffer (not just file extension)
- Max size: 10MB per file (well within the 50MB free tier per-file global limit)
- Accepted: image/jpeg, image/png, image/gif, image/webp
- Reject anything else with a 400 error before it reaches Supabase Storage

---

## 11. ANALYTICS (Vercel Analytics)

```tsx
// app/layout.tsx — one line, done
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

- Automatic page view tracking, zero configuration
- No cookie consent banner required (privacy-friendly)
- On Vercel Hobby (dev): 2,500 events/month included
- On Vercel Pro (launch): higher limits included in Pro plan
- Custom events via `track()` for key actions: "post_created", "friend_request_sent", etc.

---

## 12. ADMIN / MODERATION BACKEND

### Access Control
- `role` field on `profiles`: `user` | `moderator` | `admin`
- Admin routes protected by Next.js middleware: verify Supabase session + role check
- All admin data mutations use Supabase **service role key** in server-side API routes only — never in client code

### Admin Dashboard (`/admin`)

**Overview Stats**
- Total users (active / suspended / banned)
- New signups: today / 7 days / 30 days
- Total posts and comments
- Open reports pending review

**User Management (`/admin/users`)**
- Searchable, filterable table (by name, email, username, status, role, join date)
- Per-user actions:
  - View full profile + post history
  - Suspend (1 / 7 / 30 days — auto-lift via Supabase pg_cron or Edge Function scheduled job)
  - Ban permanently
  - Unsuspend / Unban
  - Manually verify email
  - Trigger password reset email (sends via Resend)
  - Promote to Moderator / Demote to User (admin only)

**Content Reports (`/admin/reports`)**
- Queue of pending reports showing: reporter, content preview, reason, date reported
- Filter by status: pending | reviewed | dismissed
- Actions: Dismiss · Delete content · Suspend user · Ban user
- Reviewer + timestamp logged on resolution

**Content Management (`/admin/posts`)**
- Search and view any post or comment across the platform
- Soft delete from admin panel
- View soft-deleted content with restore option

### Report Schema
```sql
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  content_type text check (content_type in ('post', 'comment', 'user')),
  content_id uuid not null,
  reason text check (reason in (
    'spam', 'harassment', 'inappropriate', 'misinformation', 'other'
  )),
  details text,
  status text default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
```

---

## 13. NAVIGATION & ROUTING

```
/ .......................... Home feed (logged in) OR landing page (logged out)
/login ..................... Login form
/signup .................... Registration form
/verify-email .............. "Check your email" screen shown post-signup
/auth/callback ............. Supabase Auth email verification callback handler
/forgot-password ........... Password reset request form
/reset-password ............ New password form (token from Supabase Auth)
/onboarding ................ Username + photo + bike info (shown once after email verify)
/profile/[username] ........ Public profile + Wall tab
/profile/[username]/photos . Photos tab
/profile/[username]/friends  Friends tab
/messages .................. Conversation list sidebar
/messages/[id] ............. Individual conversation thread
/notifications ............. Full notification history
/search .................... Search results (?q=)
/settings .................. Account settings
/settings/privacy .......... Privacy preferences
/settings/notifications .... Email notification preferences
/settings/blocked .......... Blocked users list
/admin ..................... Moderation dashboard (mod + admin only)
/admin/users ............... User management table
/admin/reports ............. Reports queue
/admin/posts ............... Content moderation
```

---

## 14. SECURITY

- Supabase Auth handles all password hashing (bcrypt under the hood)
- RLS policies enforce data access at the DB level for every table — defense in depth
- Service role key used ONLY in Next.js server-side API routes, never in client-side code
- Rate limiting: implement via Supabase Edge Functions or Upstash Ratelimit (free tier: 10,000 requests/day) on sensitive endpoints
- Input sanitization: strip HTML from all user-generated content before insert (use `sanitize-html` or `DOMPurify`)
- File uploads: validate MIME type from buffer server-side before storage
- CORS: Supabase project configured to allow only your Vercel domain
- All secrets in Vercel Environment Variables — never hardcoded or committed to Git

---

## 15. WHEN TO UPGRADE EACH SERVICE

Use this as a checklist — review weekly after launch:

| Trigger | Action |
|---|---|
| Ready to open app to real users | Upgrade Vercel Hobby → **Pro ($20/mo)** — required for commercial use |
| Ready to open app to real users | Upgrade Supabase Free → **Pro ($25/mo)** — eliminates 7-day pause |
| Daily signups approaching 80–90 | Upgrade Resend Free → **Pro ($20/mo)** — removes 100/day cap |
| Supabase Storage approaching 800MB | Already on Pro (100GB included) — no extra action |
| Supabase DB approaching 400MB | Already on Pro (8GB included) — no extra action |
| Monthly Active Users approaching 45,000 | Monitor Supabase Auth MAU counter — Pro includes 100K MAUs |

**Minimum viable launch cost: ~$45/month** (Vercel Pro + Supabase Pro)
**Add Resend Pro if needed: ~$65/month total**

---

## 16. SUGGESTED BUILD ORDER FOR CLAUDE CODE

Hand Claude Code one phase at a time. Reference this document at the start of each session.

| Phase | Focus | Notes |
|---|---|---|
| 1 | Supabase project setup · DB schema · RLS policies | Do this first — everything depends on it |
| 2 | Supabase Auth · Signup form (all 7 fields) · Resend email verification · Login · Password reset | |
| 3 | Onboarding flow · Profile page · Photo upload (Supabase Storage) | |
| 4 | Wall & Feed · Post composer · Image upload · Infinite scroll (TanStack Query) | |
| 5 | Comments · Likes · Supabase Realtime for live comments | Use Broadcast for feed, Postgres Changes for comments |
| 6 | Friend requests · Friends list | |
| 7 | Blocking · Enforce in RLS policies across all tables | |
| 8 | Search · Postgres FTS column + index + RPC function | |
| 9 | Direct messaging · Supabase Realtime · Seen receipts | |
| 10 | Notifications · Realtime badge updates · Resend email notifications | |
| 11 | Admin panel · User management · Reports queue | |
| 12 | Client-side image compression · Rate limiting · Security audit | Final pre-launch hardening |

---

## 17. STARTER PROMPT FOR CLAUDE CODE

Use this to kick off each phase:

> *"I'm building a motorcycle enthusiast social network. Here is my full feature outline and tech stack: [paste this document]. I'm using Next.js App Router, Supabase (free tier), TanStack Query, Tailwind CSS, and Resend. Let's start with Phase [N]: [phase name]. Please [specific task]."*

---

*Development cost: $0/month · Launch cost: ~$45/month (Vercel Pro + Supabase Pro) · Stack scales comfortably to 100K MAUs before needing architectural changes.*
