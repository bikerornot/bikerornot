'use client'

import { useEffect } from 'react'
import { updateLastSeen } from '@/app/actions/presence'

const THROTTLE_MS = 5 * 60 * 1000 // update at most once every 5 minutes

export default function LastSeenTracker() {
  useEffect(() => {
    const last = Number(localStorage.getItem('bon_last_seen') ?? 0)
    if (Date.now() - last > THROTTLE_MS) {
      updateLastSeen()
      localStorage.setItem('bon_last_seen', String(Date.now()))
    }
  }, [])

  return null
}
