import type { Post } from '@/lib/supabase/types'

// Module-level snapshot of the feed so scroll position and loaded pages survive
// client-side navigation (feed → profile → back). The browser can't restore
// scroll if the content isn't rendered yet — we solve that by rehydrating
// `posts`, `cursor`, and `hasMore`, then scrolling to the last visible post.
//
// Lives in module scope rather than a provider because there's only one
// consumer (FeedClient) and we want it to outlive FeedClient unmounts without
// any wrapping component staying mounted.

export interface FeedSnapshot {
  posts: Post[]
  cursor: string | null
  hasMore: boolean
  lastVisiblePostId: string | null
  savedAt: number
}

// After 5 minutes we consider the snapshot stale and fall back to a fresh
// fetch. Keeps users from seeing a hours-old feed when they come back after a
// long break.
const STALE_MS = 5 * 60 * 1000

let snapshot: FeedSnapshot | null = null

export function readFeedSnapshot(): FeedSnapshot | null {
  if (!snapshot) return null
  if (Date.now() - snapshot.savedAt > STALE_MS) {
    snapshot = null
    return null
  }
  return snapshot
}

export function writeFeedSnapshot(next: Omit<FeedSnapshot, 'savedAt'>): void {
  snapshot = { ...next, savedAt: Date.now() }
}

export function clearFeedSnapshot(): void {
  snapshot = null
}

// Cheap in-place update so scroll tracking doesn't thrash the whole snapshot
// object on every pixel of scroll.
export function updateLastVisiblePostId(id: string | null): void {
  if (snapshot) {
    snapshot.lastVisiblePostId = id
    snapshot.savedAt = Date.now()
  }
}
