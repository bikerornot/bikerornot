# 💬 BikerOrNot — Chat Room MVP Build Plan
*"The Lounge" · Single-Room Launch · Next.js + Supabase · Phased Build Guide for Claude Code*

---

## How to Use This Document

This is the complete build plan for the BikerOrNot chat room MVP. At the start of each Claude Code session, paste this document along with the phase-specific prompt at the bottom of each phase section. Build phases in order — each one depends on the last.

The chat feature uses the **same Supabase backend** as the existing web app. No separate backend or infrastructure is needed.

---

## Background & Context

**Platform state at MVP launch:** ~6,800 total members, ~600 DAU. Previously considered an ambitious multi-room chat plan (global rooms, brand rooms, regional rooms, event rooms, group rooms, verified club rooms) — that plan was rejected as overbuilt for current scale. Six empty rooms across 600 DAU would signal a dead feature. **One active room is dramatically better than six empty ones.**

**MVP philosophy:** Concentrate all activity into a single room to solve the cold-start problem. Build the architecture to support multiple rooms in the future, but launch with exactly one. The goal is to prove engagement, not to ship features.

**Critical success factor:** The room owner (product admin) will personally be present during peak hours (evenings) for the first 2–4 weeks to seed conversation. A chat room with no host feels like an empty bar.

---

## The Product: What We're Building

**One room, called "The Lounge."** No theme, no curation — just a place where riders can hang out and talk.

### Product Decisions (Locked In)

| Decision | Choice |
|---|---|
| Room name | The Lounge |
| Number of rooms at launch | 1 |
| Architecture | Built to support multiple rooms; only one exists at launch |
| Theme / topic | None — general hangout |
| Posted room rules | None at header |
| Who can see it exists | Logged-in users only |
| Who can post | Email-verified logged-in users (no extra gating) |
| History model | **Session-ephemeral** — on entry, load recent context (last ~50 messages or last 1 hour, whichever is smaller); no scroll-back beyond that |
| Server-side retention | Messages stored server-side for moderation/audit, but not exposed to user scroll-back |
| Identity shown | Username + avatar |
| Username click behavior | Opens lightweight hover/tap card (avatar, display name, primary bike, mutual friends, "Message" button linking to DM) |
| Presence | Mandatory — if you're in the room, you appear in the list |
| Presence UI | Desktop: right-hand sidebar with avatars + names. Mobile: collapsed to a tap-to-open sheet ("12 riders here →") |
| Own presence | User sees themselves at the top of the "who's here" list |
| Images | **Not in MVP** — text only |
| Links | Rendered as clickable (plain anchor tags); no preview expansion |
| Character limit | 500 per message |
| Reactions | Fixed set: 👍 🔥 🤙 😂 ❤️ |
| Reaction UI | Appear under message with count; tap the count to see who reacted |
| Typing indicator | **Not in MVP** |
| Edit own message | Yes, within 5 minutes of posting |
| Delete own message | Yes, anytime |
| Delete UI | Soft delete — message replaced with "Message removed" placeholder |
| Mentions | @username tags are visually highlighted in-room only — **no re-engagement notifications in MVP** |
| Notifications | Nav unread badge only. No email/push. |
| Mute toggle | Yes — user setting to disable the unread badge entirely |
| Moderation | Admin-only (no room-owner or mod roles in MVP) |
| Blocking behavior | If user A blocks user B, A does not see B's messages (quietly hidden). B is unaware. |
| Report message | Hooks into existing platform reports system |
| Rate limiting | None beyond email verification (revisit if spam appears) |
| First-time welcome | One-line system banner at top of message area: "Welcome to The Lounge." — dismissable, shown once per user |
| Weekly scheduled events | Not in MVP (pinned banner feature deferred) |
| Launch discoverability | Nav bar entry only (no announcement banner, no signup-flow prompt) |
| Platform | Web-first. Android comes later — shared Supabase backend will support it when ready. |

### Success Metrics (30-Day Targets)

- **Daily active chatters** (users who sent ≥1 message that day): **8–12**
- **Messages per day**: **30–50**
- **Week-over-week return rate** (chatters this week who also chat next week): **40%+**

A room with 5 silent lurkers is failing. A room with 3 active talkers is winning. Engagement > presence.

---

## Tech Stack

Aligned with the existing BikerOrNot web app. No new infrastructure.

| Layer | Technology |
|---|---|
| Framework | Next.js (existing web app) |
| UI | React + existing component library and Tailwind tokens |
| Backend | Supabase (shared project with rest of app) |
| Database | Supabase Postgres with RLS |
| Realtime | Supabase Realtime — Postgres Changes + Presence |
| Auth | Supabase Auth (existing) |
| Storage | Not used by chat in MVP (no images) |
| Reports | Existing platform reports table/system |
| Blocks | Existing `blocks` table |

---

## Database Schema

Three new tables. All have RLS enabled. All timestamps are `timestamptz`.

### `chat_rooms`

Holds room metadata. In MVP there is exactly one row (The Lounge). Table exists so multiple rooms can be added later without migration.

```sql
create table public.chat_rooms (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,          -- 'the-lounge'
  name         text not null,                 -- 'The Lounge'
  description  text,                           -- nullable, unused in MVP
  is_active    boolean not null default true,  -- admin can disable a room
  created_at   timestamptz not null default now()
);

-- Seed the single MVP room
insert into public.chat_rooms (slug, name)
values ('the-lounge', 'The Lounge');
```

### `chat_messages`

All message content, with soft-delete.

```sql
create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.chat_rooms(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) <= 500 and char_length(content) > 0),
  edited_at   timestamptz,
  deleted_at  timestamptz,            -- soft delete; when set, content hidden from UI
  created_at  timestamptz not null default now()
);

create index idx_chat_messages_room_created
  on public.chat_messages (room_id, created_at desc);
```

### `chat_reactions`

One row per (user, message, emoji). Unique constraint prevents double-reacting with same emoji.

```sql
create table public.chat_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.chat_messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null check (emoji in ('👍', '🔥', '🤙', '😂', '❤️')),
  created_at  timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index idx_chat_reactions_message on public.chat_reactions (message_id);
```

### Optional: `chat_room_dismissals`

Tracks which users have dismissed the one-time welcome banner. Could also be stored in user preferences — choose the cleaner fit for the existing codebase.

```sql
create table public.chat_room_dismissals (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  room_id     uuid not null references public.chat_rooms(id) on delete cascade,
  dismissed_welcome_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
```

### Optional: `chat_user_settings`

If you prefer a dedicated table for per-user chat prefs rather than extending `profiles`:

```sql
create table public.chat_user_settings (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  unread_badge_muted boolean not null default false,
  last_read_at       timestamptz
);
```

`last_read_at` is per-user (not per-room) because there's only one room in MVP. When multi-room support arrives, migrate this to a `(user_id, room_id)` composite key table.

---

## Row Level Security Policies

All tables must have RLS enabled. Policies below describe intent — adapt to the project's existing RLS style.

### `chat_rooms`

```sql
alter table public.chat_rooms enable row level security;

-- Any authenticated user can read active rooms
create policy "chat_rooms_select_authenticated"
  on public.chat_rooms for select
  to authenticated
  using (is_active = true);

-- Only admins can insert/update/delete (use existing admin check pattern)
create policy "chat_rooms_admin_write"
  on public.chat_rooms for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
```

### `chat_messages`

```sql
alter table public.chat_messages enable row level security;

-- Any authenticated user can read non-deleted messages in active rooms,
-- EXCEPT messages from users they've blocked or who've blocked them.
create policy "chat_messages_select_authenticated"
  on public.chat_messages for select
  to authenticated
  using (
    exists (select 1 from public.chat_rooms r where r.id = room_id and r.is_active = true)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = chat_messages.author_id)
         or (b.blocker_id = chat_messages.author_id and b.blocked_id = auth.uid())
    )
  );

-- Authenticated users can insert their own messages (email-verified enforced at app layer)
create policy "chat_messages_insert_own"
  on public.chat_messages for insert
  to authenticated
  with check (author_id = auth.uid());

-- Users can update their own messages within 5 minutes (edit window)
-- Admins can update any message (for moderation)
create policy "chat_messages_update_own_or_admin"
  on public.chat_messages for update
  to authenticated
  using (
    (author_id = auth.uid() and created_at > (now() - interval '5 minutes') and deleted_at is null)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Users can soft-delete their own (anytime); admins can delete any.
-- We do NOT allow hard DELETE on the table; always soft-delete via UPDATE setting deleted_at.
-- No DELETE policy → hard delete forbidden.
```

**Important:** Soft delete is implemented by `UPDATE ... SET deleted_at = now()`, not by `DELETE`. Don't create a DELETE policy on this table. This preserves audit trail per the original requirement.

### `chat_reactions`

```sql
alter table public.chat_reactions enable row level security;

create policy "chat_reactions_select_authenticated"
  on public.chat_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_id
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = m.author_id)
           or (b.blocker_id = m.author_id and b.blocked_id = auth.uid())
      )
    )
  );

create policy "chat_reactions_insert_own"
  on public.chat_reactions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "chat_reactions_delete_own"
  on public.chat_reactions for delete
  to authenticated
  using (user_id = auth.uid());
```

### Email verification gate

RLS above allows any authenticated user to post. Email verification is enforced at the app layer on the send-message mutation — check `auth.email_confirmed_at` before writing. If you prefer DB-level enforcement, add this check to the INSERT policy:

```sql
and exists (
  select 1 from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
)
```

---

## Supabase Realtime Configuration

Enable Realtime on all three tables:

```sql
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_reactions;
```

`chat_rooms` doesn't need Realtime in MVP (no live room updates visible to users).

### Channels

| Channel name | Purpose | Events |
|---|---|---|
| `chat:room:{roomId}` | Per-room message + reaction stream | Postgres Changes: INSERT/UPDATE on `chat_messages` filtered by `room_id`; INSERT/DELETE on `chat_reactions` where parent message is in this room |
| `chat:presence:{roomId}` | Presence tracking | Supabase Presence API — who's in the room right now |

### Presence Payload

When a user joins the room, they track their presence with:
```ts
{
  user_id: string,
  username: string,
  avatar_url: string | null,
  joined_at: string // ISO timestamp
}
```

Use Supabase Presence `track()` on channel subscribe, and `untrack()` on unsubscribe. React to `presence sync`, `join`, and `leave` events to maintain the "who's here" list in state.

---

## Routes & Navigation

### Routes

| Route | Purpose |
|---|---|
| `/chat` | Redirect to `/chat/the-lounge` (the only room in MVP). Built as redirect so the URL structure supports multiple rooms later. |
| `/chat/[slug]` | The room view. In MVP the only valid slug is `the-lounge`. |

### Nav Bar

Add a **Chat** entry to the main nav (desktop + mobile bottom nav). Icon: speech bubble or equivalent from the existing icon set. When the user has unread messages and hasn't muted the badge, show a red dot (no number — we don't need to count).

Unread logic:
- A message is "unread" if `created_at > user.last_read_at` and the user isn't currently viewing the room.
- When the user opens the room, update `last_read_at = now()`.
- When the user is actively viewing the room, the badge is hidden regardless.

---

## Data Access Layer — Key Queries

### Load recent messages (session-ephemeral)

```ts
// On room enter — load recent messages.
// Session-ephemeral means: load the smaller of (last 50 messages) or (messages from last 1 hour).
// No scroll-back beyond this initial load.

const { data } = await supabase
  .from('chat_messages')
  .select(`
    id, room_id, author_id, content, edited_at, deleted_at, created_at,
    author:profiles!author_id (
      id, username, display_name, profile_photo_url,
      primary_bike:bikes!primary (year, make, model)
    ),
    reactions:chat_reactions (emoji, user_id)
  `)
  .eq('room_id', roomId)
  .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  .order('created_at', { ascending: false })
  .limit(50);

// Reverse to chronological for display
const messages = (data ?? []).reverse();
```

### Send a message

```ts
await supabase.from('chat_messages').insert({
  room_id: roomId,
  author_id: currentUserId,
  content: text.trim()
});
// No explicit return needed — Realtime will deliver the new row to all subscribers,
// including the sender. For snappier feel, add optimistic insert locally and reconcile
// on Realtime echo by matching temp ID.
```

### Edit a message

```ts
await supabase
  .from('chat_messages')
  .update({ content: newText.trim(), edited_at: new Date().toISOString() })
  .eq('id', messageId)
  .eq('author_id', currentUserId);
// RLS enforces the 5-minute window server-side.
```

### Soft-delete a message

```ts
await supabase
  .from('chat_messages')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', messageId)
  .eq('author_id', currentUserId);
// Realtime subscribers will see the UPDATE and re-render the message as "Message removed".
```

### Add / remove reaction

```ts
// Add
await supabase.from('chat_reactions').insert({
  message_id: messageId, user_id: currentUserId, emoji
});

// Remove (user taps their own reaction again to un-react)
await supabase.from('chat_reactions')
  .delete()
  .eq('message_id', messageId)
  .eq('user_id', currentUserId)
  .eq('emoji', emoji);
```

### Reaction aggregation for display

Group reactions client-side after fetch:

```ts
type ReactionSummary = {
  emoji: string;
  count: number;
  user_ids: string[];
  reacted_by_me: boolean;
};

function summarizeReactions(
  reactions: { emoji: string; user_id: string }[],
  currentUserId: string
): ReactionSummary[] {
  const map = new Map<string, ReactionSummary>();
  for (const r of reactions) {
    const existing = map.get(r.emoji) ?? {
      emoji: r.emoji, count: 0, user_ids: [], reacted_by_me: false
    };
    existing.count += 1;
    existing.user_ids.push(r.user_id);
    if (r.user_id === currentUserId) existing.reacted_by_me = true;
    map.set(r.emoji, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
```

---

## UI Specification

### Desktop Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Nav: Feed · Search · Chat ● · Messages · Notifications · Profile]   │
├──────────────────────────────────────────────────────────────────────┤
│                                               ┌─────────────────┐   │
│   The Lounge                                  │  12 riders here │   │
│   ─────────────────────────────────────       │  ─────────────  │   │
│                                               │  ● You          │   │
│   [Welcome to The Lounge. ✕]   ← dismissable  │  ● MikeRider    │   │
│                                               │  ● SarahV       │   │
│   [Avatar] MikeRider · 2:14pm                 │  ● RoadDog      │   │
│   Anyone else doing the Tampa ride Saturday?  │  ● ...          │   │
│   👍 3  🔥 1                                  │                 │   │
│                                               │                 │   │
│   [Avatar] SarahV · 2:16pm                    │                 │   │
│   Count me in. Weather looks solid.           │                 │   │
│                                               │                 │   │
│   [Avatar] You · 2:18pm   [edit] [delete]     │                 │   │
│   Meeting point?                              │                 │   │
│                                               │                 │   │
│   ─────────────────────────────────────       │                 │   │
│   [ Type a message...                   ] [→] │                 │   │
│   427 / 500                                   │                 │   │
└──────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌─────────────────────────┐
│ ← The Lounge    12 👥 ▾ │  ← Tap the 👥 to open presence sheet
├─────────────────────────┤
│ [Welcome to The Lounge.]│
│ [ ✕ dismiss]            │
│                         │
│ [Av] MikeRider · 2:14pm │
│ Anyone else doing the   │
│ Tampa ride Saturday?    │
│ 👍 3  🔥 1              │
│                         │
│ [Av] SarahV · 2:16pm    │
│ Count me in. Weather...│
│                         │
│ [Av] You · 2:18pm  ⋮    │
│ Meeting point?          │
│                         │
├─────────────────────────┤
│ [Type a message...] [→] │
│ 427 / 500               │
├─────────────────────────┤
│ [Feed│Srch│Chat●│DM│Me] │
└─────────────────────────┘
```

### Message Item Anatomy

- **Avatar** (40×40 circle, clickable → opens hover card)
- **Username** (clickable → opens hover card)
- **Primary bike badge** next to username, e.g. `[HD Sportster]` — small pill, muted color. Only shown if user has a primary bike in their garage.
- **Timestamp** — relative ("2m ago") if < 1 hour, clock time ("2:14pm") if older in same day, date + time if from another day. Not expected in MVP since history is ~1hr.
- **Edited marker** — small "(edited)" suffix if `edited_at` is set.
- **Deleted state** — replace content with italic "Message removed", hide reactions, hide edit/delete controls.
- **Message body** — 500 char max, URLs auto-linked with `<a target="_blank" rel="noopener noreferrer">`. No preview expansion. Plain text, no markdown.
- **@mention highlight** — text matching `@username` (where username exists in the platform) is rendered as a clickable styled span that opens the mentioned user's hover card. This is purely visual — no notification is sent in MVP.
- **Reactions row** — below message body. Pills like `[👍 3]`. User's own reaction styled differently (filled / outlined distinction). Tap to toggle own reaction. Tap the count area of an existing reaction to see who reacted (tooltip on desktop, bottom sheet on mobile).
- **Reaction picker** — on hover (desktop) or long-press (mobile) on a message, show a small popover with the 5 fixed emojis. Tap one to react.
- **Own-message controls** — edit (within 5 min of `created_at`, only if `deleted_at` is null) and delete, shown in a `⋮` menu or on hover.
- **Report menu item** — `⋮` menu on any message except your own — "Report message" routes into the existing reports system, creating a report record with a reference to the `chat_messages.id`.

### Hover / Tap Card (when clicking a username or avatar)

Compact popover card:
- Avatar (larger, 64×64)
- Display name
- @username
- Primary bike (year make model)
- "X mutual friends" count
- **Message** button → navigates to DM with that user (or opens DM conversation)

This card intentionally does NOT have "Add friend" or "Block" — those actions live on the full profile. Clicking anywhere else on the card (name, avatar) navigates to the full profile.

### Composer

- Single-line textarea that auto-grows up to ~4 lines before scrolling internally
- Live character counter `427 / 500`; counter turns orange at 450 and red at 490
- Send button disabled if input is empty or over 500 chars
- Enter sends, Shift+Enter inserts newline (desktop)
- Mobile: dedicated send button, Enter inserts newline

### Presence Panel

**Desktop (right sidebar, ~240px wide):**
- Header: "X riders here"
- List: avatar + username per row
- "You" appears at the top with a subtle "(you)" label
- Clicking any entry opens the same hover card as clicking a username in a message

**Mobile (collapsed by default):**
- Header button shows "12 riders here ▾"
- Tap to open a bottom sheet with the same list
- The sheet is scrollable if many riders are present

### Welcome Banner

- Shown only the first time a user enters the room
- Content: "Welcome to The Lounge."
- Small ✕ to dismiss
- On dismiss: insert a row into `chat_room_dismissals` (or flip a user pref flag)
- Never shown again to that user, even across sessions

### Empty State

If there are no recent messages when the user enters:
> "It's quiet right now. Be the first to say something."

The presence panel continues to show who's in the room.

---

## Moderation (MVP)

Admin-only for MVP. No room-owner or moderator roles.

**Admin tools (in the admin panel or inline when viewing chat as admin):**
- Soft-delete any message (UPDATE sets `deleted_at`)
- Resolve reports from the existing reports system — reports tied to `chat_messages` show the message content, author, and a direct link to delete

**User tools:**
- Report message (one-click, via existing reports system)
- Block user (platform-wide, existing feature) — messages from blocked user are hidden quietly in chat as a bonus effect

There is **no** slow mode, kick, mute, ban, pin, or auto-moderation in MVP. If these are needed later, they'll be added in a Phase 5+ iteration.

---

## Phased Build

**Five phases.** Build in order.

---

# PHASE 1 — Schema, RLS & Realtime Setup

**Goal:** Create the database foundation. No UI yet.

## Deliverables

- Migration file(s) creating `chat_rooms`, `chat_messages`, `chat_reactions`, and `chat_room_dismissals` (or equivalent for the welcome-dismissed flag)
- Seed the single row in `chat_rooms`: `('the-lounge', 'The Lounge')`
- RLS policies as specified:
  - `chat_rooms`: read active rooms; admin-only write
  - `chat_messages`: read active-room messages except from blocked users in either direction; insert own; update own within 5 min OR admin; no DELETE policy (force soft-delete)
  - `chat_reactions`: read (same block filter); insert own; delete own
- Indexes: `(room_id, created_at desc)` on messages, `(message_id)` on reactions
- Add `chat_messages` and `chat_reactions` to the Realtime publication
- Confirm email-verified enforcement approach: either at app layer on mutations, or add the `email_confirmed_at` check to the INSERT policy — pick one and apply it consistently
- Document which existing table holds the admin role check (likely `profiles.role = 'admin'`) and wire it into the RLS policies using the project's existing pattern

## Manual Verification Steps

- As an authenticated user, `select` from `chat_messages` filtered by the seeded room returns an empty list
- Insert a test message → visible to other authenticated users
- Insert a block row from User A → User B → User A's chat reads no longer show B's messages
- Attempt to update another user's message → denied
- Attempt to update own message older than 5 minutes → denied
- Attempt to DELETE (hard) any message → denied (must soft-delete via UPDATE)

## Claude Code Prompt for Phase 1

> *"I'm adding a chat room feature to BikerOrNot. Here is the full MVP build plan: [paste this document]. Let's start with Phase 1: Schema, RLS & Realtime Setup. Create the Supabase migration for `chat_rooms`, `chat_messages`, `chat_reactions`, and the welcome-dismissal tracking (either as a table or a column on an existing prefs table — pick whichever fits the codebase). Write RLS policies exactly as specified in the build plan, including the block-filter on SELECT. Seed the single `the-lounge` row. Enable Realtime publication on `chat_messages` and `chat_reactions`. Confirm the existing admin-role check pattern and apply it. Do NOT build any UI yet — this phase is pure backend."*

---

# PHASE 2 — Read-Only Room Shell

**Goal:** Users can navigate to `/chat/the-lounge`, see the UI shell, see recent messages (if any), and see who's in the room. No sending or reacting yet.

## Deliverables

- Routes:
  - `/chat` → redirect to `/chat/the-lounge`
  - `/chat/[slug]` → the chat room page (404 if slug isn't an active room)
- Nav entry added to the main nav (desktop) and bottom nav (mobile) with a speech-bubble icon. No unread badge yet.
- Chat room page renders:
  - Header with room name
  - Message list (empty state if no messages)
  - One-time welcome banner (reads the dismissal state — dismiss button wired up)
  - Presence panel (desktop sidebar / mobile collapsed sheet)
  - Composer UI (input disabled / read-only for this phase)
- Load recent messages on mount using the session-ephemeral query (last 50 OR last hour, whichever is smaller)
- Subscribe to `chat:room:{roomId}` channel for Postgres Changes (INSERT/UPDATE on `chat_messages`) — new messages appear in real time, updated messages reflect edits/soft-deletes
- Subscribe to `chat:presence:{roomId}` using Supabase Presence API — track self on join, untrack on leave, maintain a list in React state
- Presence list renders: "You" at top, then all other riders, with avatars + usernames
- Username/avatar click → hover card (desktop) or bottom sheet (mobile) showing display name, @username, primary bike, mutual friends count, "Message" button that opens the DM with that user
- Messages render:
  - Author avatar, username, primary bike pill, timestamp
  - Message content with URL auto-linking (plain anchor, no preview)
  - @mention visual highlight (clickable to open that user's hover card)
  - Soft-deleted messages show "Message removed" placeholder
  - Edited messages show "(edited)"
  - Reaction pills visible with counts (tap-to-see-who works in read-only mode)
- Handle Supabase connection loss gracefully — show a subtle "Reconnecting…" banner

## Claude Code Prompt for Phase 2

> *"Phase 2 of the BikerOrNot chat MVP. Build the read-only room shell. Reference the full build plan. Create `/chat` (redirect) and `/chat/[slug]` routes. Add the Chat nav entry (desktop + mobile). Build the chat room page with header, message list, presence panel (right sidebar on desktop, tap-to-open sheet on mobile), welcome banner with dismissal, and composer UI (disabled for this phase). Implement session-ephemeral message loading (last 50 OR last hour). Wire up Supabase Realtime Postgres Changes subscription for new/edited/deleted messages. Wire up Supabase Presence — the current user shows at the top of the list as 'You'. Build the hover-card/bottom-sheet for username clicks with the Message-to-DM button. Render messages with avatar, username, primary bike pill, URL auto-linking, @mention highlighting, soft-delete placeholder, and edited marker. Reactions should display (from the schema) but not be interactive yet. No sending, editing, deleting, or reacting yet — that's Phase 3."*

---

# PHASE 3 — Sending, Editing, Deleting, Reacting

**Goal:** The room is now interactive. Users can send messages, edit their own within 5 minutes, delete their own anytime, and react.

## Deliverables

- Composer fully wired:
  - Send on Enter (Shift+Enter for newline on desktop)
  - Mobile: send button; Enter inserts newline
  - Character counter `X / 500`; turns orange at 450, red at 490
  - Send button disabled when empty or over 500
  - Trim whitespace on send; don't send empty messages
  - Optimistic insert with temp ID; reconcile on Realtime echo (match by temp ID → real ID swap)
  - Email-verified gate at UI layer: if user's email isn't confirmed, composer shows a banner "Verify your email to chat" with a resend button
- Own-message edit:
  - `⋮` menu or hover controls show "Edit" only if `created_at > now() - 5 min` and not deleted
  - Clicking Edit turns the message into an inline editable field with Save / Cancel
  - Save writes the UPDATE; UI updates on Realtime echo
  - Edited messages get "(edited)" marker
- Own-message delete:
  - `⋮` menu shows "Delete" anytime for own messages
  - Confirmation dialog before deleting
  - Writes `deleted_at = now()` via UPDATE (soft delete)
  - Renders as "Message removed" on Realtime echo
- Reactions:
  - Hover on desktop / long-press on mobile → reaction picker popover with the 5 fixed emojis
  - Tap an emoji → INSERT a reaction
  - Tap an existing reaction pill where the user has already reacted → DELETE that reaction (toggle off)
  - Subscribe to `chat_reactions` INSERT and DELETE events for the current room's messages; update reaction summaries live
  - Tap a reaction count → tooltip (desktop) or bottom sheet (mobile) listing usernames who reacted with that emoji
  - Summarize reactions client-side using the aggregation helper in the build plan
- Report message (in `⋮` menu, on messages not authored by the current user) → calls the existing reports system with a reference to `chat_messages.id`
- Block interaction: confirm the RLS filter is working end-to-end — when User A blocks User B, B's messages disappear from A's view on Realtime (either by not being delivered, or by client-side filter matching against a local blocks cache; prefer RLS-level filtering so they're never delivered)

## Claude Code Prompt for Phase 3

> *"Phase 3 of the BikerOrNot chat MVP. Make the room interactive. Reference the build plan. Wire up the composer: send on Enter, Shift+Enter newline, 500-char counter, disabled states, optimistic insert with temp-ID reconciliation on Realtime echo, email-verified gate. Implement own-message edit within 5 minutes (inline editable field, Save/Cancel, '(edited)' marker), own-message soft-delete (confirmation, UPDATE sets deleted_at, 'Message removed' placeholder). Implement reactions: picker popover with the 5 fixed emojis (hover on desktop, long-press on mobile), toggle on/off, Realtime subscription to chat_reactions INSERT/DELETE, reaction pill counts, tap-to-see-who tooltip/sheet. Wire the Report menu item to the existing reports system using `chat_messages.id` as the reference. Verify blocks work end-to-end — messages from blocked users should never appear via the Realtime stream (RLS should filter them)."*

---

# PHASE 4 — Unread Badge, Mute, Mobile Polish

**Goal:** Pull users back to the room via a nav unread indicator, let them mute it if they don't want the nudge, and make sure mobile feels great.

## Deliverables

- `last_read_at` tracking:
  - Update `last_read_at = now()` when the user focuses/opens the chat page
  - Also update on every Realtime new-message event while the room is in the foreground (so the badge doesn't re-appear while actively chatting)
- Unread nav badge:
  - Compute: does any message exist with `created_at > user.last_read_at` AND the user is not currently viewing the room?
  - Simple implementation: on app load and on receiving a Realtime new-message event while NOT on the chat page, show a red dot on the Chat nav entry
  - No unread count number — just a dot
  - Badge clears when the user opens the chat page
- Unread-muted setting:
  - Add a toggle in the user's settings/preferences page: "Show unread indicator for chat"
  - When off, the badge never appears regardless of unread state
  - Persist in `chat_user_settings.unread_badge_muted` or in the existing prefs system, whichever fits the codebase
- Mobile polish pass:
  - Presence bottom sheet smoothness (drag-to-dismiss if the pattern matches the rest of the app)
  - Reaction long-press doesn't conflict with text selection
  - Keyboard behavior: composer stays visible above the keyboard; message list scrolls to bottom when new messages arrive if the user is already near the bottom
  - Safe-area insets respected on iOS Safari
- Desktop polish:
  - Presence sidebar responsive — collapses below a certain viewport width
  - Message list auto-scrolls to bottom on new message if user is already near the bottom; otherwise shows a "New messages ↓" pill that scrolls on click
- Empty-state polish: "It's quiet right now. Be the first to say something." — shown when the initial load returns zero messages

## Claude Code Prompt for Phase 4

> *"Phase 4 of the BikerOrNot chat MVP. Build the unread badge and mute toggle, then polish mobile and desktop. Reference the build plan. Implement `last_read_at` tracking — update on chat page focus and on Realtime events while the room is in the foreground. Add a red-dot unread indicator on the Chat nav entry (no count, just a dot), shown when unread messages exist and user isn't viewing the room. Add a 'Show unread indicator for chat' toggle in user settings that suppresses the badge entirely. Polish mobile: presence sheet smoothness, long-press vs. text-selection, keyboard behavior, safe-area insets, auto-scroll-to-bottom logic with 'New messages ↓' pill. Polish desktop: responsive presence sidebar collapse. Add the empty-state message."*

---

# PHASE 5 — Admin Tools, Observability & Launch Prep

**Goal:** Give admins what they need to moderate in practice, instrument the feature so we can measure against our success metrics, and ship.

## Deliverables

### Admin tools

- Admin-only UI (inline on the chat page when viewing as admin, or in the existing admin panel — whichever pattern already exists in the project):
  - Soft-delete any message via the `⋮` menu (shows even on other users' messages if current user is admin)
  - Reports queue for chat messages integrates into the existing reports dashboard with direct "Delete message" action
- Make sure the RLS UPDATE policy on `chat_messages` correctly allows admin deletes as specified in the schema section

### Observability

- Basic event logging for:
  - `chat_room_entered` (user_id, room_id, timestamp)
  - `chat_message_sent` (user_id, room_id, message_id, timestamp, content_length)
  - `chat_reaction_added` (user_id, message_id, emoji)
  - `chat_message_deleted_by_self` and `chat_message_deleted_by_admin`
  - `chat_unread_badge_muted`
- Route through whatever analytics the existing app uses (PostHog, Amplitude, Supabase logs, or a simple `analytics_events` table). Don't introduce new tooling.

### Success-metric dashboard (internal)

Queries the admin can run ad-hoc against the DB:

```sql
-- Daily active chatters (last 30 days)
select date(created_at) as day, count(distinct author_id) as chatters
from chat_messages
where deleted_at is null and created_at > now() - interval '30 days'
group by day order by day;

-- Messages per day
select date(created_at) as day, count(*) as messages
from chat_messages
where deleted_at is null and created_at > now() - interval '30 days'
group by day order by day;

-- Week-over-week return rate
with weekly as (
  select author_id, date_trunc('week', created_at) as week
  from chat_messages
  where deleted_at is null
  group by 1, 2
)
select
  w1.week,
  count(distinct w1.author_id) as this_week_chatters,
  count(distinct w2.author_id) as returned_next_week,
  round(100.0 * count(distinct w2.author_id) / nullif(count(distinct w1.author_id), 0), 1) as return_pct
from weekly w1
left join weekly w2
  on w2.author_id = w1.author_id and w2.week = w1.week + interval '7 days'
group by w1.week order by w1.week;
```

Save these as a README note in the repo so the admin can paste them into the Supabase SQL editor.

### Launch checklist

- Smoke test: sign in on two browsers as two users, exchange messages, reactions, edits, deletes, and confirm everything syncs in real time with no refresh
- Block test: User A blocks User B; confirm B's prior messages disappear from A's view (or at minimum, stop appearing on refresh — in a session-ephemeral room this is acceptable since the history window is short)
- Report test: report a message, confirm it lands in the admin reports queue
- Email-verification gate: create an unverified account and confirm the composer is blocked with the verification banner
- Mobile test on iOS Safari and Android Chrome at minimum
- Accessibility spot-check: keyboard-only navigation of the composer and reaction picker; screen reader reads messages with author context
- Load test: open 20 browser tabs in the room, post rapidly, confirm Supabase Realtime holds up (Supabase Pro tier should handle this easily)
- Rate-limit sanity: even without MVP rate limiting, confirm that a user hammering the send button doesn't break the UI (debounce the send button while a request is in flight)
- Confirm the nav badge behaves correctly: appears when appropriate, clears on entry, respects mute toggle
- Confirm the welcome banner appears exactly once per user

### Admin seeding plan (documented in README, not code)

- Admin (product owner) commits to being present in The Lounge during peak evening hours (e.g., 7–10pm ET) for the first 2–4 weeks
- Admin posts a conversation-starter once per day minimum to seed activity
- Track daily metrics vs. the 30-day targets and iterate based on what we learn

## Claude Code Prompt for Phase 5

> *"Phase 5 of the BikerOrNot chat MVP — admin tools, observability, and launch prep. Reference the build plan. Wire admin-only inline soft-delete for any message. Ensure chat message reports integrate into the existing reports dashboard with a 'Delete message' action. Log the specified analytics events using whatever the app already uses. Add the three SQL queries (DAU chatters, messages per day, WoW return rate) to a README note for ad-hoc admin use. Run through the full launch checklist in the build plan and fix anything that's broken. After this phase, the feature is ready to ship."*

---

## What's Explicitly Out of Scope for MVP

Keeping this list here so it's clear and revisitable later:

- Multiple rooms (architecture supports it; only one exists)
- Images, videos, GIFs
- Link previews (YouTube, images, articles)
- Threaded replies
- Typing indicators
- Custom reactions / reaction customization beyond the fixed 5
- @mention re-engagement notifications (email, push, in-app notifications panel)
- Email/push notifications of any kind (nav dot only)
- Moderator role, room-owner role
- Slow mode, kick, mute, ban, auto-moderation, word filters
- Pinned messages
- Weekly scheduled events / pinned announcement banner
- Sponsored rooms
- Brand rooms, regional rooms, event rooms, group rooms, verified club rooms
- Search within room history
- Message scroll-back beyond the initial session-ephemeral load
- Digest emails
- Native Android client (shared Supabase backend will support it when the Android app adds chat; that's a separate build tracked in the Android plan)

---

## Quick Reference: Claude Code Session Starter

> *"I'm building the BikerOrNot chat room MVP — a single room called The Lounge on the existing Next.js + Supabase web app. Here is the full build plan: [paste this document]. We are currently on Phase [N]. [Describe what was completed last session if resuming]. Please [specific task for this session]."*

---

*Chat Room MVP plan — 5 phases · Single room (The Lounge) · Architecture supports future multi-room · Shared Supabase backend with rest of app*
