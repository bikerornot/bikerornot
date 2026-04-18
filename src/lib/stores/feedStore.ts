import type { Post } from '@/lib/supabase/types'

// Module-level snapshot of the feed so scroll position and loaded pages survive
// client-side navigation (feed → profile → back). The browser can't restore
// scroll if the content isn't rendered yet — we solve that by rehydrating
// `posts`, `cursor`, and `hasMore`, then scrolling to the last visible post.
//
// Persisted to sessionStorage as a backup because iOS Safari often fails to
// bfcache (thanks to React effects and realtime websockets), which wipes
// module state on back navigation. sessionStorage survives those reloads.

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
const STORAGE_KEY = 'bon.feedSnapshot.v1'

let snapshot: FeedSnapshot | null = null
let hydratedFromStorage = false

function loadFromStorage(): FeedSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FeedSnapshot
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeStorage(snap: FeedSnapshot | null): void {
  if (typeof window === 'undefined') return
  try {
    if (snap) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Quota or privacy mode — silently fail, module state still works.
  }
}

function ensureHydrated(): void {
  if (hydratedFromStorage) return
  hydratedFromStorage = true
  const fromStorage = loadFromStorage()
  if (fromStorage) snapshot = fromStorage
}

export function readFeedSnapshot(): FeedSnapshot | null {
  ensureHydrated()
  if (!snapshot) return null
  if (Date.now() - snapshot.savedAt > STALE_MS) {
    snapshot = null
    writeStorage(null)
    return null
  }
  return snapshot
}

export function writeFeedSnapshot(next: Omit<FeedSnapshot, 'savedAt'>): void {
  snapshot = { ...next, savedAt: Date.now() }
  writeStorage(snapshot)
}

export function clearFeedSnapshot(): void {
  snapshot = null
  writeStorage(null)
}

// Called on every scroll frame. We short-circuit when the id hasn't changed
// so sessionStorage only gets written on actual anchor transitions — typically
// once every couple of seconds of scrolling, not every frame. Writing on each
// change guarantees freshness if module state gets wiped between navigations
// (iOS Safari sometimes does this even on client-side Next.js Link nav).
export function updateLastVisiblePostId(id: string | null): void {
  if (!snapshot) return
  if (snapshot.lastVisiblePostId === id) return
  snapshot.lastVisiblePostId = id
  snapshot.savedAt = Date.now()
  writeStorage(snapshot)
}

// Called from the FeedClient unmount path and pagehide handler so we flush
// the latest anchor id to storage before the page goes away.
export function flushFeedSnapshot(): void {
  if (snapshot) writeStorage(snapshot)
}
