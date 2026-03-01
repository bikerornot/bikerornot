'use client'

import { useEffect } from 'react'

// Pings the heartbeat endpoint every 60 seconds to keep last_seen_at fresh.
// Rendered in the root layout so it runs on every page while logged in.
export default function Heartbeat() {
  useEffect(() => {
    function ping() {
      fetch('/api/heartbeat', { method: 'POST' }).catch(() => {})
    }

    ping()
    const interval = setInterval(ping, 60_000)
    return () => clearInterval(interval)
  }, [])

  return null
}
