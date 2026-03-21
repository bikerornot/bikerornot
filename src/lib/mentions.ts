import { notifyIfActive } from '@/lib/notify'

const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g

/** Extract unique usernames from text (without the @ prefix) */
export function extractMentions(text: string): string[] {
  const matches = text.matchAll(MENTION_REGEX)
  const usernames = new Set<string>()
  for (const m of matches) {
    usernames.add(m[1].toLowerCase())
  }
  return Array.from(usernames)
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
  admin: any
}) {
  const { authorId, content, postId, commentId, admin } = opts
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

  // Send notifications to mentioned friends
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
}
