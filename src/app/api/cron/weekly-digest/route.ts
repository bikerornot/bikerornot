import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendWeeklyDigestEmail,
  type WeeklyDigestPayload,
  type NearbyRiderDigest,
  type FriendRequestDigest,
  type UnreadMessageDigest,
  type BirthdayDigest,
  type MissedPostDigest,
  type UpcomingEventDigest,
} from '@/lib/email'

export const maxDuration = 300

const SOFT_DISTANCE_CAP_MI = 500
const EVENT_RADIUS_MI = 150
const RIDER_BLOCK_LIMIT = 5
const POST_BLOCK_LIMIT = 3
const EVENT_BLOCK_LIMIT = 3
const FR_SAMPLE_LIMIT = 3
const DM_SAMPLE_LIMIT = 3
const BDAY_LIMIT = 5
const BDAY_WINDOW_DAYS = 7

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Days from now until this user's next birthday, considering today as 0.
// Returns null if no DOB on file or DOB doesn't parse.
function daysUntilBirthday(dob: string | null, now: Date): number | null {
  if (!dob) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob)
  if (!m) return null
  const month = parseInt(m[2], 10) - 1
  const day = parseInt(m[3], 10)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  let candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day))
  if (candidate < today) candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, month, day))
  return Math.round((candidate.getTime() - today.getTime()) / 86400000)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  const oneWeekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString()
  const url = new URL(request.url)
  const testUsername = url.searchParams.get('test')
  const batchStart = parseInt(url.searchParams.get('start') ?? '0')
  const batchSize = parseInt(url.searchParams.get('size') ?? '500')

  // ── 1. New signups (this week) ───────────────────────────────────────────
  const { data: newSignups } = await admin
    .from('profiles')
    .select('id, username, first_name, city, state, latitude, longitude, profile_photo_url')
    .eq('onboarding_complete', true)
    .eq('status', 'active')
    .is('deactivated_at', null)
    .not('latitude', 'is', null)
    .gte('created_at', oneWeekAgoIso)

  const newSignupList = newSignups ?? []
  const newIds = new Set(newSignupList.map((s) => s.id))

  // bikes for new signups (used in the "new riders near you" block)
  const newSignupBikeMap: Record<string, string> = {}
  if (newSignupList.length > 0) {
    const { data: bikes } = await admin
      .from('user_bikes')
      .select('user_id, year, make, model')
      .in('user_id', newSignupList.map((s) => s.id))
    for (const b of bikes ?? []) {
      if (!newSignupBikeMap[b.user_id] && b.year && b.make && b.model) {
        newSignupBikeMap[b.user_id] = `${b.year} ${b.make} ${b.model}`
      }
    }
  }

  // ── 2. Recipients batch ──────────────────────────────────────────────────
  const recipients: any[] = []
  if (testUsername) {
    const { data: testUser } = await admin
      .from('profiles')
      .select('id, username, first_name, latitude, longitude, email_weekly_digest, last_digest_sent_at, date_of_birth')
      .eq('username', testUsername)
      .single()
    if (testUser) recipients.push(testUser)
  } else {
    const { data: chunk } = await admin
      .from('profiles')
      .select('id, username, first_name, latitude, longitude, email_weekly_digest, last_digest_sent_at, date_of_birth')
      .eq('onboarding_complete', true)
      .eq('status', 'active')
      .is('deactivated_at', null)
      .not('latitude', 'is', null)
      .order('created_at', { ascending: true })
      .range(batchStart, batchStart + batchSize - 1)
    if (chunk) recipients.push(...chunk)
  }

  if (recipients.length === 0) {
    return NextResponse.json({ message: 'No recipients in batch', batchStart, sent: 0 })
  }

  const recipientIds = recipients.map((r) => r.id)

  // ── 3. Email lookup (batched in 50s to keep auth API gentle) ─────────────
  const emailMap = new Map<string, string>()
  for (let i = 0; i < recipientIds.length; i += 50) {
    const slice = recipientIds.slice(i, i + 50)
    const results = await Promise.all(
      slice.map((id) =>
        admin.auth.admin.getUserById(id).then(({ data }) => ({ id, email: data?.user?.email })),
      ),
    )
    for (const r of results) if (r.email) emailMap.set(r.id, r.email)
  }

  // ── 4. Friendship graph (used in many blocks) ────────────────────────────
  const { data: allFriendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, status')

  const friendsByUser = new Map<string, Set<string>>()
  const pendingByAddressee = new Map<string, string[]>()
  for (const f of allFriendships ?? []) {
    if (f.status === 'accepted') {
      if (!friendsByUser.has(f.requester_id)) friendsByUser.set(f.requester_id, new Set())
      if (!friendsByUser.has(f.addressee_id)) friendsByUser.set(f.addressee_id, new Set())
      friendsByUser.get(f.requester_id)!.add(f.addressee_id)
      friendsByUser.get(f.addressee_id)!.add(f.requester_id)
    } else if (f.status === 'pending') {
      if (!pendingByAddressee.has(f.addressee_id)) pendingByAddressee.set(f.addressee_id, [])
      pendingByAddressee.get(f.addressee_id)!.push(f.requester_id)
    }
  }

  // ── 5. Pending FR sender profiles for this batch ─────────────────────────
  const pendingSenderIds = new Set<string>()
  for (const id of recipientIds) {
    const senders = pendingByAddressee.get(id) ?? []
    for (const s of senders) pendingSenderIds.add(s)
  }
  const senderProfileMap = new Map<string, FriendRequestDigest>()
  if (pendingSenderIds.size > 0) {
    const { data: senders } = await admin
      .from('profiles')
      .select('id, username, first_name, profile_photo_url, status, deactivated_at')
      .in('id', Array.from(pendingSenderIds))
    // Skip banned, suspended, and deactivated senders. A pending FR from a
    // user who's since been kicked off the platform isn't actionable —
    // surfacing it makes us look like we still have those scammers around.
    for (const s of senders ?? []) {
      if (s.status !== 'active' || s.deactivated_at) continue
      senderProfileMap.set(s.id, {
        username: s.username ?? 'unknown',
        firstName: s.first_name ?? '',
        profilePhotoUrl: s.profile_photo_url ?? null,
      })
    }
  }

  // ── 6. Unread DMs grouped by recipient ───────────────────────────────────
  // Pull conversations where each recipient is a participant + that have at
  // least one unread message FROM the other party.
  const { data: convoRows } = await admin
    .from('conversations')
    .select('id, participant1_id, participant2_id, last_message_at, status')
    .or(recipientIds.map((id) => `participant1_id.eq.${id},participant2_id.eq.${id}`).join(','))
    .neq('status', 'ignored')
    .gte('last_message_at', oneWeekAgoIso)

  const convoOther = new Map<string, string>()
  for (const c of convoRows ?? []) {
    for (const uid of recipientIds) {
      const otherId =
        c.participant1_id === uid
          ? c.participant2_id
          : c.participant2_id === uid
            ? c.participant1_id
            : null
      if (!otherId) continue
      convoOther.set(`${uid}:${c.id}`, otherId)
    }
  }

  // For each convo, count unread messages from the other party + grab latest preview
  const unreadByUser = new Map<string, UnreadMessageDigest[]>()
  if ((convoRows ?? []).length > 0) {
    const allConvoIds = (convoRows ?? []).map((c: any) => c.id)
    const { data: msgs } = await admin
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at, read_at')
      .in('conversation_id', allConvoIds)
      .is('read_at', null)
      .gte('created_at', oneWeekAgoIso)
      .order('created_at', { ascending: false })
      .limit(5000)

    // Walk messages once, group by (recipient, conversation)
    const counts = new Map<string, { count: number; latest: any }>()
    for (const m of msgs ?? []) {
      // For each recipient who's in this conversation, check if the message is from the OTHER party
      for (const uid of recipientIds) {
        const otherId = convoOther.get(`${uid}:${m.conversation_id}`)
        if (!otherId) continue
        if (m.sender_id !== otherId) continue
        const key = `${uid}:${m.conversation_id}`
        const existing = counts.get(key)
        if (existing) {
          existing.count++
        } else {
          counts.set(key, { count: 1, latest: m })
        }
      }
    }

    // Look up sender display info for all 'other' participants we saw
    const otherIdsSet = new Set<string>()
    for (const [, v] of counts) otherIdsSet.add(v.latest.sender_id)
    const otherProfileMap = new Map<string, { username: string; firstName: string; photoUrl: string | null }>()
    if (otherIdsSet.size > 0) {
      const { data: others } = await admin
        .from('profiles')
        .select('id, username, first_name, profile_photo_url, status, deactivated_at')
        .in('id', Array.from(otherIdsSet))
      for (const o of others ?? []) {
        if (o.status !== 'active' || o.deactivated_at) continue
        otherProfileMap.set(o.id, {
          username: o.username ?? 'unknown',
          firstName: o.first_name ?? '',
          photoUrl: o.profile_photo_url ?? null,
        })
      }
    }

    for (const [key, v] of counts) {
      const [uid, convoId] = key.split(':')
      const sender = otherProfileMap.get(v.latest.sender_id)
      if (!sender) continue // banned/suspended/deactivated, skip
      if (!unreadByUser.has(uid)) unreadByUser.set(uid, [])
      unreadByUser.get(uid)!.push({
        conversationId: convoId,
        senderUsername: sender.username,
        senderFirstName: sender.firstName,
        senderPhotoUrl: sender.photoUrl,
        preview: v.latest.content ?? '',
        count: v.count,
      })
    }
  }

  // ── 7. Friend birthdays this week ────────────────────────────────────────
  const allFriendIds = new Set<string>()
  for (const id of recipientIds) {
    const fs = friendsByUser.get(id) ?? new Set()
    fs.forEach((fid) => allFriendIds.add(fid))
  }
  const friendBdayMap = new Map<string, BirthdayDigest & { id: string }>()
  if (allFriendIds.size > 0) {
    const { data: bdayRows } = await admin
      .from('profiles')
      .select('id, username, first_name, profile_photo_url, date_of_birth, status, deactivated_at')
      .in('id', Array.from(allFriendIds))

    const now = new Date()
    for (const r of bdayRows ?? []) {
      if (r.status !== 'active' || r.deactivated_at) continue
      const days = daysUntilBirthday(r.date_of_birth, now)
      if (days == null) continue
      if (days > BDAY_WINDOW_DAYS) continue
      friendBdayMap.set(r.id, {
        id: r.id,
        username: r.username ?? 'unknown',
        firstName: r.first_name ?? '',
        profilePhotoUrl: r.profile_photo_url ?? null,
        daysAway: days,
      })
    }
  }

  // ── 8. Friend posts (most-liked, last 7d, recipient hasn't liked) ────────
  // Pull all posts from any potentially-relevant friend in one query, then
  // partition per recipient. Limited to active authors, no group/wall/bike posts.
  const friendPostMap = new Map<string, MissedPostDigest[]>()
  if (allFriendIds.size > 0) {
    const { data: postsRows } = await admin
      .from('posts')
      .select('id, author_id, content, created_at, author:profiles!author_id(username, first_name, profile_photo_url, status, deactivated_at)')
      .in('author_id', Array.from(allFriendIds))
      .is('deleted_at', null)
      .is('wall_owner_id', null)
      .is('group_id', null)
      .is('bike_id', null)
      .gte('created_at', oneWeekAgoIso)
      .order('created_at', { ascending: false })
      .limit(2000)

    const validPosts = (postsRows ?? []).filter((p: any) => p.author?.status === 'active' && !p.author?.deactivated_at)
    const postIds = validPosts.map((p: any) => p.id)

    // Like counts + comment counts
    const likeCounts = new Map<string, number>()
    const commentCounts = new Map<string, number>()
    if (postIds.length > 0) {
      const { data: likes } = await admin
        .from('post_likes')
        .select('post_id, user_id')
        .in('post_id', postIds)
      const likedByUser = new Map<string, Set<string>>()
      for (const l of likes ?? []) {
        likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1)
        if (!likedByUser.has(l.user_id)) likedByUser.set(l.user_id, new Set())
        likedByUser.get(l.user_id)!.add(l.post_id)
      }
      const { data: comments } = await admin
        .from('comments')
        .select('post_id')
        .in('post_id', postIds)
        .is('deleted_at', null)
      for (const c of comments ?? []) {
        commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1)
      }

      // Build per-recipient missed post list
      for (const uid of recipientIds) {
        const myFriends = friendsByUser.get(uid) ?? new Set()
        const myLiked = likedByUser.get(uid) ?? new Set()
        const candidates = validPosts
          .filter((p: any) => myFriends.has(p.author_id))
          .filter((p: any) => !myLiked.has(p.id))
          .map((p: any) => ({
            postId: p.id,
            authorUsername: p.author.username ?? 'unknown',
            authorFirstName: p.author.first_name ?? '',
            authorPhotoUrl: p.author.profile_photo_url ?? null,
            content: p.content,
            likeCount: likeCounts.get(p.id) ?? 0,
            commentCount: commentCounts.get(p.id) ?? 0,
          }))
          .sort((a: MissedPostDigest, b: MissedPostDigest) => b.likeCount - a.likeCount)
          .slice(0, POST_BLOCK_LIMIT)
        if (candidates.length > 0) friendPostMap.set(uid, candidates)
      }
    }
  }

  // ── 9. Upcoming events ───────────────────────────────────────────────────
  // Grab everything upcoming with coords; filter per-recipient by distance.
  const { data: upcomingEvents } = await admin
    .from('events')
    .select('id, slug, title, starts_at, city, state, latitude, longitude, cover_photo_url, flyer_url, status')
    .gte('starts_at', new Date().toISOString())
    .lte('starts_at', new Date(Date.now() + 14 * 86400000).toISOString())
    .neq('status', 'cancelled')
    .not('latitude', 'is', null)
    .order('starts_at', { ascending: true })
    .limit(500)

  // ── 10. Per-recipient: build payload, send if any block populated ────────
  let sent = 0
  let skipped = 0
  let errored = 0

  for (const user of recipients) {
    if (user.email_weekly_digest === false) {
      skipped++
      continue
    }
    if (newIds.has(user.id)) {
      skipped++
      continue
    }
    if (
      user.last_digest_sent_at &&
      Date.now() - new Date(user.last_digest_sent_at).getTime() < 6 * 86400000
    ) {
      skipped++
      continue
    }

    const email = emailMap.get(user.id)
    if (!email) {
      skipped++
      continue
    }

    // Pending FRs — drop banned/suspended/deactivated senders. We pre-filtered
    // them out of senderProfileMap, so the active list is whichever IDs still
    // resolve to a profile. Both count and samples reflect active senders only.
    const activePendingSenders = (pendingByAddressee.get(user.id) ?? [])
      .map((sid) => senderProfileMap.get(sid))
      .filter((s): s is FriendRequestDigest => !!s)
    const pendingFRBlock =
      activePendingSenders.length > 0
        ? {
            count: activePendingSenders.length,
            samples: activePendingSenders.slice(0, FR_SAMPLE_LIMIT),
          }
        : undefined

    // Unread DMs
    const unreadList = unreadByUser.get(user.id) ?? []
    const unreadTotal = unreadList.reduce((sum, u) => sum + u.count, 0)
    const unreadBlock =
      unreadTotal > 0
        ? {
            count: unreadTotal,
            samples: unreadList
              .sort((a, b) => b.count - a.count)
              .slice(0, DM_SAMPLE_LIMIT),
          }
        : undefined

    // Birthdays
    const myFriends = friendsByUser.get(user.id) ?? new Set<string>()
    const bdays: BirthdayDigest[] = []
    for (const fid of myFriends) {
      const b = friendBdayMap.get(fid)
      if (b) bdays.push(b)
    }
    bdays.sort((a, b) => a.daysAway - b.daysAway)
    const birthdayBlock = bdays.length > 0 ? { friends: bdays.slice(0, BDAY_LIMIT) } : undefined

    // Missed friend posts
    const missedPosts = friendPostMap.get(user.id) ?? []
    const missedBlock = missedPosts.length > 0 ? { posts: missedPosts } : undefined

    // Upcoming events near user
    const eventsNearby: UpcomingEventDigest[] = []
    if (user.latitude != null && user.longitude != null) {
      for (const e of upcomingEvents ?? []) {
        if (e.latitude == null || e.longitude == null) continue
        const d = haversine(user.latitude, user.longitude, e.latitude, e.longitude)
        if (d > EVENT_RADIUS_MI) continue
        eventsNearby.push({
          slug: e.slug,
          title: e.title,
          startsAt: e.starts_at,
          city: e.city,
          state: e.state,
          coverPhotoUrl: e.cover_photo_url,
          flyerUrl: e.flyer_url,
          distanceMi: d,
        })
      }
      eventsNearby.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    }
    const eventsBlock = eventsNearby.length > 0 ? { events: eventsNearby.slice(0, EVENT_BLOCK_LIMIT) } : undefined

    // Nearest 5 new riders (soft cap 500 mi, drop friends)
    let nearbyBlock: { riders: NearbyRiderDigest[]; total: number } | undefined
    if (user.latitude != null && user.longitude != null) {
      const ranked = newSignupList
        .filter((s) => !myFriends.has(s.id))
        .map((s) => ({
          username: s.username ?? 'unknown',
          firstName: s.first_name ?? '',
          city: s.city,
          state: s.state,
          bike: newSignupBikeMap[s.id] ?? null,
          profilePhotoUrl: s.profile_photo_url,
          distanceMi:
            s.latitude != null && s.longitude != null
              ? haversine(user.latitude, user.longitude, s.latitude, s.longitude)
              : null,
        }))
        .filter((r) => r.distanceMi != null && r.distanceMi <= SOFT_DISTANCE_CAP_MI)
        .sort((a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity))

      if (ranked.length > 0) {
        nearbyBlock = {
          riders: ranked.slice(0, RIDER_BLOCK_LIMIT),
          total: ranked.length,
        }
      }
    }

    const payload: WeeklyDigestPayload = {
      toEmail: email,
      toName: user.first_name ?? 'there',
      blocks: {
        pendingFriendRequests: pendingFRBlock,
        unreadMessages: unreadBlock,
        birthdays: birthdayBlock,
        missedFriendPosts: missedBlock,
        upcomingEvents: eventsBlock,
        nearbyRiders: nearbyBlock,
      },
    }

    const hasAny =
      !!payload.blocks.pendingFriendRequests ||
      !!payload.blocks.unreadMessages ||
      !!payload.blocks.birthdays ||
      !!payload.blocks.missedFriendPosts ||
      !!payload.blocks.upcomingEvents ||
      !!payload.blocks.nearbyRiders

    if (!hasAny) {
      skipped++
      continue
    }

    try {
      const res = await sendWeeklyDigestEmail(payload)
      if ((res as any)?.skipped) {
        skipped++
        continue
      }
      await admin
        .from('profiles')
        .update({ last_digest_sent_at: new Date().toISOString() })
        .eq('id', user.id)
      sent++
    } catch (err) {
      errored++
      console.error(`Weekly digest failed for ${user.id}:`, err)
    }

    if (sent % 10 === 0) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  // Self-chain to next batch.
  const hasMore = !testUsername && recipients.length === batchSize
  if (hasMore) {
    const nextUrl = new URL(request.url)
    nextUrl.searchParams.set('start', String(batchStart + batchSize))
    nextUrl.searchParams.set('size', String(batchSize))
    fetch(nextUrl.toString(), {
      headers: { authorization: authHeader ?? '' },
    }).catch((err) => console.error('Weekly digest self-chain failed:', err))
  }

  return NextResponse.json({
    message: 'Weekly digest complete',
    newSignups: newSignupList.length,
    batchStart,
    batchSize,
    recipients: recipients.length,
    sent,
    skipped,
    errored,
    nextBatch: hasMore ? batchStart + batchSize : null,
  })
}

