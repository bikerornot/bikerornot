# Message Requests — Implementation Plan

**Status:** Draft, awaiting approval
**Author:** Claude (with James)
**Date:** 2026-04-16
**Target milestone:** Phase 15

---

## 1. Goal

Decouple messaging from the friendship graph. Allow any user to send a single intro message to any other user; route unknown-sender messages into a separate "Requests" bucket so receivers can triage them without cluttering their main inbox.

**Problem this solves:** Only 10% of new users send a DM. The current four-step process (friend request → wait for accept → then message) is the bottleneck. Industry-standard message-request pattern (Instagram, Messenger, LinkedIn, Twitter) consistently drives first-message conversion.

**Success criteria:** Measurable lift in `unique_messagers` and in first-message conversion from new signups (target: 10% → 25%+) within 30 days of launch.

---

## 2. Specification

### 2.1 Sender experience

- Tap **Message** on any non-friend's profile. Opens a compose screen.
- Compose and send one intro message. Goes to recipient's "Requests" tab.
- Button on the profile changes to **Requested** for that recipient — cannot send another message until recipient accepts.
- If recipient has "Friends only" privacy on: Message button hidden; instead shows "Only accepts messages from friends" with an Add Friend CTA.
- If sender is over their daily limit: friendly error ("You've reached today's limit of N requests. Try again tomorrow.").
- If sender was ignored by this recipient within last 30 days: same friendly error without exposing the ignore ("You've reached your limit for this rider.").
- Sent requests appear in sender's main inbox with a "Pending" badge. No accepted/ignored indication unless recipient replies.

### 2.2 Recipient experience

- New request arrives. In-app notification: "James sent you a message request."
- Badge count on "Requests" tab of `/messages`.
- Tapping opens the thread in a read-only preview with three action buttons:
  - **Accept** → thread status flips to `active`, moves to main Messages inbox, bidirectional DM unlocks indefinitely for this pair.
  - **Ignore** → thread status flips to `ignored`, disappears from receiver's view, sender sees no change, 30-day cooldown applied.
  - **Block** → existing block flow + sets status to `ignored`. Sender never sends to this recipient again.
- While in `request` state, recipient cannot reply via compose box; they must first Accept.
- Replying to a request IS an implicit accept (optional enhancement — UI could fold "Reply" as a fourth button that combines Accept + compose).

### 2.3 Friend-to-friend messaging

Unchanged. Friends bypass the request gate entirely; messages go straight to main inbox with status `active`.

### 2.4 Privacy setting

Settings → Privacy → "Who can message you?"
- **Everyone** (default)
- **Friends only**

---

## 3. Database Changes

All changes are additive — no drops, no type changes, no data loss risk.

### Migration: `supabase/migrations/20260417_message_requests.sql`

```sql
-- 1. Conversation status + origin tracking
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('request', 'active', 'ignored')),
  ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS ignored_at timestamptz;

-- Backfill: all existing conversations are active (they were friend-gated)
-- No action needed — DEFAULT handles this for existing rows.

-- 2. Privacy preference
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS message_privacy text NOT NULL DEFAULT 'everyone'
    CHECK (message_privacy IN ('everyone', 'friends_only'));

-- 3. Indexes for inbox queries
CREATE INDEX IF NOT EXISTS idx_conversations_p1_status
  ON conversations(participant1_id, status) WHERE status IN ('request', 'active');
CREATE INDEX IF NOT EXISTS idx_conversations_p2_status
  ON conversations(participant2_id, status) WHERE status IN ('request', 'active');

-- 4. Cooldown index — fast lookup for "has this sender been ignored by this recipient in last 30 days"
CREATE INDEX IF NOT EXISTS idx_conversations_cooldown
  ON conversations(initiated_by, ignored_at) WHERE ignored_at IS NOT NULL;

-- 5. RLS policy update: recipients only see requests meant for them
-- (Existing RLS likely already scopes to participant1/participant2 membership;
--  no new policy needed if so. Verify in implementation.)
```

### Rationale

- `status` as a checked-text column rather than an enum type — easier to extend later, no breaking migration if we add a state.
- `initiated_by` tracks who sent the first message (always the requester). Needed for rate limiting and cooldown queries.
- `ignored_at` stores when it flipped to ignored — enables 30-day cooldown without an extra table.
- Partial indexes (`WHERE status IN (...)`) keep them small since most conversations will be `active` long-term.

### Backfill

`DEFAULT 'active'` on new column auto-backfills every existing row. No separate backfill statement needed.

---

## 4. Threat Model

| Threat | Mitigation |
|---|---|
| Mass spam from throwaway accounts | Unverified daily limit: 3 requests/day. Verified users get 10/day. |
| Targeted harassment (one attacker, many requests to one victim) | 30-day per-recipient cooldown. After one ignore, sender is silently blocked from requesting that user for 30 days. Block button = hard block, works forever. |
| Scam/phishing DMs from strangers | AI scam scan runs on every request with 0.45 flag threshold (vs 0.55 for friend DMs). NO auto-ban on requests — flagged to human admin for review only, to avoid false-positive bans on legitimate first contact. |
| Coordinated scam farms | Existing account-level scam behavioral scoring (`src/lib/scammer-score.ts`) applies. Admin watchlist catches patterns. |
| Bypassing blocks via requests | `startConversation` action MUST check blocks before creating. Blocked users get the same generic "limit reached" error — no block disclosure. |
| Privacy setting bypass | Privacy enforcement in server action (not just UI). UI hides Message button; server rejects request creation if recipient has `friends_only`. |
| RLS leakage | Request threads visible only to participants. Standard RLS on conversations/messages scopes to participant membership — request status doesn't change participant list. |
| Sender inferring ignore state | Sender sees "Pending" badge indefinitely; ignore/accept not disclosed. The ONLY signal sender gets is: the recipient replied (in which case thread becomes `active`). |

---

## 5. Server Actions

### 5.1 `startConversation(recipientId, content)` — NEW

File: `src/app/actions/messages.ts` (append)

Logic:
1. Auth check — user must be logged in
2. Sanity check — recipientId ≠ senderId, recipient exists, recipient not banned/deactivated
3. Block check — neither user blocks the other (query `blocks` table both directions)
4. Privacy check — if recipient.message_privacy = 'friends_only' AND users are not friends, reject
5. Rate limit check — count sender's requests initiated today; reject if over daily limit (10 verified, 3 unverified)
6. Cooldown check — query for any conversation where `initiated_by = sender AND (participant1_id = recipientId OR participant2_id = recipientId) AND status = 'ignored' AND ignored_at > now() - interval '30 days'`. If found, reject with generic "limit reached" error.
7. Existing conversation check — if a conversation already exists between these two users:
   - If status='active': this isn't a request, use normal sendMessage path (error or redirect)
   - If status='request' and sender was the initiator: reject (can't follow up)
   - If status='request' and sender is the recipient: this means they're replying to an existing request → flip to 'active' + insert message (implicit accept)
   - If status='ignored': reject (cooldown will catch this)
8. Determine status:
   - If users are friends → `active`
   - If not friends → `request`
9. Create conversation row with `initiated_by = senderId`, `status = <determined>`
10. Insert message
11. If status='request': create `message_request` notification for recipient; if status='active' with a friend, standard message notification
12. Trigger AI scam scan (non-blocking via `after()`), with request threshold if status='request'

Return: `{ conversationId, status }`

### 5.2 `sendMessage(conversationId, content)` — MODIFY

File: `src/app/actions/messages.ts`

Changes:
- Remove the existing friendship requirement check (if present)
- Add: load conversation, check `status`
  - If `status = 'request'`:
    - If sender is `initiated_by`: reject ("Waiting for reply")
    - If sender is the other participant: flip status to `active`, insert message (implicit accept)
  - If `status = 'active'`: proceed as today
  - If `status = 'ignored'`: reject (though UI shouldn't expose this — defense in depth)
- AI scam scan threshold depends on status (pre-accept = request threshold)

### 5.3 `acceptMessageRequest(conversationId)` — NEW

Validates current user is the non-initiator participant and status='request'. Flips status to `active`. No message inserted.

### 5.4 `ignoreMessageRequest(conversationId)` — NEW

Validates current user is the non-initiator participant and status='request'. Sets status='ignored', ignored_at=now(). Triggers notification cleanup (remove the `message_request` notification from recipient's bell).

### 5.5 `blockFromMessageRequest(conversationId)` — NEW

Convenience wrapper: calls existing block action against `initiated_by`, then calls ignoreMessageRequest.

### 5.6 `getMessageRequests()` — NEW

Returns conversations where current user is a participant, status='request', and current user is NOT `initiated_by` (i.e., the recipient view).

### 5.7 `getConversations()` — MODIFY

Exclude rows where current user is non-initiator AND status='request' (those belong in the Requests tab, not main inbox). Senders DO see their sent requests in main inbox with pending badge.

---

## 6. UI Changes

### 6.1 Inbox tabs — `/messages` (src/app/messages/page.tsx)

Add pill tab selector above the thread list:
- **Messages** (default)
- **Requests** (badge count = number of pending inbound requests)

Each tab calls its own server action (`getConversations` vs `getMessageRequests`). Matches pattern from the people-search mode selector.

### 6.2 Request thread view — src/app/messages/[conversationId]/page.tsx

When rendering a conversation where `status='request'` and current user is the recipient:
- Show a three-button action bar above the message area: **Accept** | **Ignore** | **Block**
- Hide/disable the ChatWindow compose box (reply disabled until accept)
- When sender views their own sent request: show "Pending" badge in the sub-header; keep compose disabled (they can't follow up anyway)

When `status='active'` — render exactly as today.

### 6.3 Profile page — Message button for non-friends

File: `src/app/profile/[username]/` components (need to locate exact file for "view non-friend profile")

- If viewing own profile or a friend: existing buttons
- If viewing a non-friend whose `message_privacy='everyone'`: show **Message** button. Tapping opens compose screen.
- If viewing a non-friend whose `message_privacy='friends_only'`: hide Message button, show disabled state or tooltip "Only accepts messages from friends"
- If there's already a pending/sent request: button shows **Requested** (disabled)

### 6.4 Compose screen for intro message — NEW

Could reuse the existing ChatWindow compose, OR show a dedicated "Send intro message" modal. I recommend a dedicated modal for clarity: "Send a message to @username" with the compose box and a "Send" button. Makes the request nature of the action clear.

### 6.5 Settings — Privacy toggle

File: `src/app/settings/` (existing settings page)

Add section "Privacy → Who can message you?" with radio:
- Everyone (default)
- Friends only

Hook to new `updateMessagePrivacy(value)` server action.

### 6.6 Notification rendering

Notification type `message_request`:
- Bell dropdown text: "@username sent you a message request"
- Tap → route to `/messages/[conversationId]` (Requests tab context)

---

## 7. AI Scam Scan Integration

File: `src/app/actions/scam-scan.ts`

Add branch: when called from a request-creation path, pass `isRequest=true`. Adjust thresholds:
- Request messages: flag at **0.45**, NO auto-ban
- Friend DMs: existing 0.55 flag, 0.85 auto-ban (unchanged)

All flags go to `/admin/flags` for human review.

Rationale: cold first messages from strangers have higher scam base rate but also higher false-positive risk for legitimate intros. Lower flag threshold catches more, but humans decide on bans.

---

## 8. Rate Limits and Cooldown

Enforced server-side in `startConversation`:

**Daily limits:**
- Phone-verified users: 10 requests/day
- Unverified users: 3 requests/day

Query: `SELECT COUNT(*) FROM conversations WHERE initiated_by = $1 AND status IN ('request','active','ignored') AND created_at > now() - interval '1 day'`

**30-day per-recipient cooldown after ignore:**
- Query: `SELECT 1 FROM conversations WHERE initiated_by = $sender AND (participant1_id = $recipient OR participant2_id = $recipient) AND status = 'ignored' AND ignored_at > now() - interval '30 days' LIMIT 1`
- If any row found → reject

**No separate rate-limit table needed** — conversation-count query suffices and stays consistent with source of truth.

---

## 9. Notifications

### 9.1 In-app (immediate)

Reuse existing `notifications` table pattern. Add `message_request` type. On request creation, insert a notification row for recipient pointing to the conversation.

### 9.2 Push / digest (deferred, V1 scope)

Real APNs/FCM push is out of scope for this phase — infra isn't set up. For V1:
- In-app notification bell (immediate)
- Email: piggy-back on existing weekly digest (`src/app/actions/digest.ts` or similar) — include a "You have N pending message requests" line

Future enhancement (separate phase): proper push with "You have a new message request" grouped once per day.

---

## 10. Task Breakdown

Tasks are ordered by dependency. Each is an atomic commit.

### Wave 1 — Schema (foundation)

**T1.1** Create migration `20260417_message_requests.sql`
- Adds `status`, `initiated_by`, `ignored_at` to `conversations`
- Adds `message_privacy` to `profiles`
- Adds indexes
- Verify: run migration, confirm existing conversations default to `status='active'`, no data loss

**T1.2** Update generated types `src/lib/supabase/types.ts`
- Regenerate types to pick up new columns

### Wave 2 — Server actions (logic)

**T2.1** Implement `startConversation` action in `src/app/actions/messages.ts`
- All guards: auth, self-send, block, privacy, rate limit, cooldown
- Conversation creation + message insertion
- AI scam scan hook (request threshold)

**T2.2** Modify `sendMessage` to handle request status
- Status-based routing (request/active/ignored)
- Implicit accept when recipient replies to a request
- Remove legacy friend-gate

**T2.3** Implement `acceptMessageRequest`, `ignoreMessageRequest`, `blockFromMessageRequest`
- Status transitions, notification cleanup

**T2.4** Implement `getMessageRequests`; modify `getConversations` to exclude recipient-side requests
- New query, modified query, type updates

**T2.5** Adjust `scam-scan.ts` for per-status thresholds
- Pass status/isRequest parameter from caller
- Branch threshold logic

### Wave 3 — UI (user-facing)

**T3.1** `/messages` tabs (Messages | Requests)
- Tab component, data fetching split, badge count

**T3.2** Request thread action bar (Accept/Ignore/Block)
- New component `MessageRequestActions.tsx`
- Conditional rendering on conversation page
- Compose disabled when status='request' and user is sender

**T3.3** Non-friend profile Message button
- Re-enable button, conditional on privacy setting
- "Requested" state display
- Privacy-block state ("Only accepts messages from friends")

**T3.4** Compose intro message modal
- New modal or inline compose screen
- Hooks to `startConversation`

**T3.5** Settings — "Who can message you?" toggle
- Radio selector in privacy section
- `updateMessagePrivacy` server action

**T3.6** Notification rendering for `message_request` type
- Text, routing, bell badge integration

### Wave 4 — Verification & polish

**T4.1** End-to-end test against verification criteria (§12)
- Manual walkthrough, fix surface bugs

**T4.2** Update memory `MEMORY.md` with new feature context
- Document architecture, file locations, thresholds, limits

---

## 11. Rollback Strategy

**If issues arise post-deploy:**

### Soft rollback (preserve data)
1. Revert UI commits — tabs disappear, Message button re-hides for non-friends, compose enforces friend-gate
2. Revert server action commits — `sendMessage` reverts to friend requirement
3. Leave migration columns in place (no data loss; status column simply unused)

Every commit atomic; `git revert <sha>` is sufficient per wave.

### Hard rollback (kill feature)
1. Soft rollback
2. Hide all `status='request'` conversations from all inbox queries (one-line filter in `getConversations`)
3. Request threads sit quietly in DB, no user action needed

### Migration rollback
Migration is 100% additive. If needed:
```sql
ALTER TABLE conversations DROP COLUMN status, DROP COLUMN initiated_by, DROP COLUMN ignored_at;
ALTER TABLE profiles DROP COLUMN message_privacy;
DROP INDEX idx_conversations_p1_status, idx_conversations_p2_status, idx_conversations_cooldown;
```
Safe because no existing code reads these columns yet.

---

## 12. Verification Criteria

### Functional
- [ ] Non-friend sees Message button on another non-friend's profile (if privacy=everyone)
- [ ] Non-friend with privacy=friends_only does NOT see Message button from a non-friend viewer
- [ ] Sending intro message creates conversation with status='request'
- [ ] That conversation shows in recipient's "Requests" tab, not Messages tab
- [ ] Recipient sees Accept / Ignore / Block action bar
- [ ] Accept flips status to 'active', conversation moves to Messages tab, both can now DM
- [ ] Ignore hides thread from recipient; sender sees no change
- [ ] Block hides thread and blocks sender (existing block works)
- [ ] Sender cannot send 2nd message while status='request' (UI disables, server rejects)
- [ ] Rate limit: 11th request by a phone-verified user in 24h is rejected
- [ ] Rate limit: 4th request by unverified user in 24h is rejected
- [ ] Cooldown: after ignore, sender cannot send new request to same recipient for 30 days
- [ ] Friend-to-friend DMs work exactly as before (no request gate)
- [ ] Existing conversations (pre-migration) still work and appear in Messages tab
- [ ] Notification bell shows "sent you a message request" entries
- [ ] AI scam scan flags request messages at 0.45 threshold (not 0.55), does not auto-ban

### Security
- [ ] Server-side privacy enforcement: tampering with client cannot bypass `friends_only` setting
- [ ] Block enforcement: blocked sender gets generic rate-limit error, no block disclosure
- [ ] RLS: non-participants cannot read request conversations or messages via direct queries
- [ ] Rate limits enforced in server action (not client)

### Performance
- [ ] `/messages` Requests tab loads in <1s with up to 50 pending requests
- [ ] Conversation list queries use new partial indexes (verify with EXPLAIN)

---

## 13. Out of Scope (Future Work)

- Group DMs / group chats
- Chat rooms (separate feature per memory)
- Real APNs/FCM push notifications (infra work, separate phase)
- Ignored-requests archive for receiver to review past ignores
- Sent-requests status visibility (currently sender only sees "Pending" forever; no accepted-date)
- Per-conversation privacy overrides (e.g., "allow messages from this specific non-friend even though I'm friends-only")
- Bulk triage UI for many requests at once
- Migrating from "implicit accept on reply" to "explicit accept only" if user testing shows confusion

---

## 14. Open Questions

None — all five clarifying questions from discussion have been answered. Ready for review and execution approval.

---

## 15. Execution Notes

- Each task = one atomic commit with conventional message
- Do NOT modify unrelated files; keep commits laser-focused
- Do NOT add backwards-compat shims; remove legacy friend-gate cleanly
- Migration runs before any app code depends on the new columns (Wave 1 must be fully deployed before Wave 2 commits ship)
- After all waves land, run the verification checklist (§12) manually before declaring done
