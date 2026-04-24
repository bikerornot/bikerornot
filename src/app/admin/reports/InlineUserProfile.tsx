'use client'

import { useEffect, useState } from 'react'
import { getAdminUserProfileBundle, type AdminUserProfileBundle } from '@/app/actions/admin'
import UserDetailView from '@/app/admin/users/[id]/UserDetailView'

interface Props {
  userId: string
}

// Fetches the admin user profile bundle on mount and renders the same
// UserDetailView the standalone /admin/users/[id] page uses. Spared the
// round-trip to that route so moderators can review flagged content +
// user context without losing their place in the queue.
export default function InlineUserProfile({ userId }: Props) {
  const [bundle, setBundle] = useState<AdminUserProfileBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAdminUserProfileBundle(userId)
      .then((b) => { if (!cancelled) setBundle(b) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load profile') })
    return () => { cancelled = true }
  }, [userId])

  if (error) {
    return <p className="text-red-400 text-sm px-4 py-6">Failed to load profile: {error}</p>
  }
  if (!bundle) {
    return <p className="text-zinc-500 text-sm px-4 py-6">Loading profile…</p>
  }
  return <UserDetailView bundle={bundle} embedded />
}
