'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

interface Props {
  userId: string
  initialLastSeen: string | null
  initialShowOnline?: boolean
}

export default function OnlineIndicator({ userId, initialLastSeen, initialShowOnline = true }: Props) {
  const [online, setOnline] = useState(
    initialShowOnline && initialLastSeen ? Date.now() - new Date(initialLastSeen).getTime() < ONLINE_THRESHOLD_MS : false
  )

  useEffect(() => {
    if (!initialShowOnline) return
    const supabase = createClient()

    // Poll every 60 seconds
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('last_seen_at, show_online_status')
        .eq('id', userId)
        .single()
      if (data) {
        setOnline(
          data.show_online_status !== false &&
          !!data.last_seen_at &&
          Date.now() - new Date(data.last_seen_at).getTime() < ONLINE_THRESHOLD_MS
        )
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [userId, initialShowOnline])

  if (!online) return null

  return (
    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full flex-shrink-0" title="Online" />
  )
}
