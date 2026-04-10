'use client'

import { useEffect } from 'react'

// Pings the heartbeat endpoint every 60 seconds to keep last_seen_at fresh.
// Rendered in the root layout so it runs on every page while logged in.
//
// Also logs a daily session row once per user per day (for real DAU and
// retention curves). The client gates this by writing the current date to
// localStorage after a successful log, so we only send the session flag on
// the first heartbeat of the day per browser. Rechecks each tick so a user
// who stays on the tab past midnight still gets logged for the new day.
export default function Heartbeat() {
  useEffect(() => {
    const SESSION_KEY = 'bon_session_logged_day'

    function ping() {
      const today = new Date().toISOString().slice(0, 10)
      let logSession = false
      try {
        logSession = localStorage.getItem(SESSION_KEY) !== today
      } catch {
        // localStorage unavailable (private mode / iframe) — skip session log
      }

      const url = logSession ? '/api/heartbeat?session=1' : '/api/heartbeat'
      fetch(url, { method: 'POST' })
        .then((r) => {
          if (r.ok && logSession) {
            try {
              localStorage.setItem(SESSION_KEY, today)
            } catch {
              // Ignore — next tick will retry
            }
          }
        })
        .catch(() => {})
    }

    ping()
    const interval = setInterval(ping, 60_000)
    return () => clearInterval(interval)
  }, [])

  return null
}
