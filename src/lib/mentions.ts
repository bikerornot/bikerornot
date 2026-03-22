import { notifyIfActive } from '@/lib/notify'
import { sendMentionEmail } from '@/lib/email'
import { getImageUrl } from '@/lib/supabase/image'

const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g

const BASE_URL = 'https://www.bikerornot.com'

// Delay before sending mention email — gives user time to see in-app notification
const EMAIL_DELAY_MS = 5 * 60 * 1000 // 5 minutes

/** Extract unique usernames from text (without the @ prefix) */
export function extractMentions(text: string): string[] {
  const matches = text.matchAll(MENTION_REGEX)
  const usernames = new Set<string>()
  for (const m of matches) {
    usernames.add(m[1].toLowerCase())
  }
  return Array.from(usernames)
}

/** Truncate text to a snippet, breaking at word boundaries */
function makeSnippet(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut) + '…'
}

/**
 * Send mention notifications to tagged friends.
 * Only notifies users who are accepted friends of the author.
 * Max 5 mentions per post/comment.
 */
export async function notifyMentions(opts: {
  authorId: string
  content: string
  postId: string
  commentId?: string
  postImageUrl?: string | null
  admin: any
}) {
  const { authorId, content, postId, commentId, postImageUrl, admin } = opts
  const usernames = extractMentions(content).slice(0, 5)
  if (usernames.length === 0) return

  // Look up user IDs for mentioned usernames
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username')
    .in('username', usernames)
    .eq('status', 'active')

  if (!profiles || profiles.length === 0) return

  // Filter to only friends of the author
  const mentionedIds = profiles.map((p: any) => p.id).filter((id: string) => id !== authorId)
  if (mentionedIds.length === 0) return

  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(
      mentionedIds
        .map((id: string) => `and(requester_id.eq.${authorId},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${authorId})`)
        .join(',')
    )

  const friendIds = new Set<string>()
  for (const f of friendships ?? []) {
    friendIds.add(f.requester_id === authorId ? f.addressee_id : f.requester_id)
  }

  // Send in-app notifications to mentioned friends
  for (const profile of profiles) {
    if (profile.id === authorId) continue
    if (!friendIds.has(profile.id)) continue

    await notifyIfActive(authorId, {
      user_id: profile.id,
      type: 'mention',
      actor_id: authorId,
      post_id: postId,
      comment_id: commentId ?? null,
    })
  }

  // Schedule email notifications (delayed, so active users see in-app first)
  const mentionedFriendIds = profiles
    .filter((p: any) => p.id !== authorId && friendIds.has(p.id))
    .map((p: any) => p.id)

  if (mentionedFriendIds.length === 0) return

  // Fire-and-forget: delay then send emails
  scheduleMentionEmails({
    authorId,
    mentionedUserIds: mentionedFriendIds,
    content,
    postId,
    postImageUrl: postImageUrl ?? null,
    admin,
  }).catch(() => {})
}

/**
 * Wait EMAIL_DELAY_MS, then send emails to mentioned users who haven't been
 * active since the mention. Skips users who opted out or were recently online.
 */
async function scheduleMentionEmails(opts: {
  authorId: string
  mentionedUserIds: string[]
  content: string
  postId: string
  postImageUrl: string | null
  admin: any
}) {
  const { authorId, mentionedUserIds, content, postId, postImageUrl, admin } = opts
  const mentionedAt = new Date()

  // Wait before sending
  await new Promise((resolve) => setTimeout(resolve, EMAIL_DELAY_MS))

  // Get author info for the email
  const { data: author } = await admin
    .from('profiles')
    .select('username, profile_photo_url, updated_at')
    .eq('id', authorId)
    .single()

  if (!author?.username) return

  // Get mentioned users' profiles and email preferences
  const { data: mentionedProfiles } = await admin
    .from('profiles')
    .select('id, first_name, username, profile_photo_url, updated_at, email_mentions, last_seen_at')
    .in('id', mentionedUserIds)
    .eq('status', 'active')

  if (!mentionedProfiles || mentionedProfiles.length === 0) return

  const authorAvatarUrl = author.profile_photo_url
    ? getImageUrl('avatars', author.profile_photo_url, undefined, author.updated_at)
    : null

  const snippet = makeSnippet(content)
  const postUrl = `${BASE_URL}/posts/${postId}`

  // Resolve the first post image URL if present
  const imageUrl = postImageUrl
    ? getImageUrl('posts', postImageUrl)
    : null

  for (const profile of mentionedProfiles) {
    // Skip if user opted out of mention emails
    if (profile.email_mentions === false) continue

    // Skip if user was active after the mention (they likely saw the in-app notification)
    if (profile.last_seen_at && new Date(profile.last_seen_at) > mentionedAt) continue

    // Get their email from auth
    const { data: authUser } = await admin.auth.admin.getUserById(profile.id)
    const email = authUser?.user?.email
    if (!email) continue

    const toAvatarUrl = profile.profile_photo_url
      ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
      : null

    sendMentionEmail({
      toEmail: email,
      toName: profile.first_name ?? 'there',
      toAvatarUrl,
      fromUsername: author.username,
      fromAvatarUrl: authorAvatarUrl,
      postSnippet: snippet,
      postUrl,
      postImageUrl: imageUrl,
    }).catch(() => {})
  }
}
