'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// Reusable realtime subscription with the three fixes that every
// postgres_changes / presence channel in this codebase needs (see
// memory/realtime-subscriptions.md for the backstory):
//
//   1. Auth push BEFORE subscribe — the factory's getSession()+setAuth is
//      async and can lose the race with a .subscribe() call, leaving the
//      channel joined anonymously. Each subscription has to await setAuth
//      itself to guarantee the JOIN carries the user's JWT.
//   2. Auto-reconnect on terminal status — Supabase's free tier silently
//      stops delivering events on idle channels without closing the socket.
//      CHANNEL_ERROR / TIMED_OUT / CLOSED each bump a generation counter
//      so the useEffect tears down the dead channel and creates a fresh
//      one. 2-second debounce avoids a tight loop if the server is down.
//   3. visibilitychange reconnect — tabs that were backgrounded can come
//      back with a zombie socket. Resubscribe when the tab is visible again.
//
// The `setup` callback configures the channel (calls `.on(...)` to attach
// listeners) and returns the channel ready to subscribe. The hook owns the
// auth handshake, subscribe, status monitoring, reconnect, and cleanup.
// Callers include their listener deps in the `deps` array — the hook appends
// its own reconnect-generation dep under the hood.
export function useRealtimeChannel(
  channelName: string,
  setup: (channel: RealtimeChannel, supabase: SupabaseClient) => RealtimeChannel,
  deps: React.DependencyList,
  options?: { presence?: { key: string } }
) {
  const [rtGen, setRtGen] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      await supabase.realtime.setAuth(session?.access_token ?? null)
      if (cancelled) return

      const raw = supabase.channel(
        channelName,
        options?.presence ? { config: { presence: options.presence } } : undefined
      )
      const configured = setup(raw, supabase)

      channel = configured.subscribe((status) => {
        if (cancelled) return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn(`[realtime:${channelName}] status ${status} — reconnecting`)
          reconnectTimer = setTimeout(() => setRtGen((g) => g + 1), 2000)
        }
      })
    })()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (channel) supabase.removeChannel(channel)
    }
    // `setup` is intentionally omitted — callers are expected to include
    // whatever their setup closes over in `deps`, same contract as useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, rtGen, channelName])

  useEffect(() => {
    // Only reconnect on real backgrounding, not on brief visibility flickers.
    // Mobile fires visibilitychange for keyboard show/hide, screen dims,
    // in-app switcher previews, etc. — forcing a reconnect on each of those
    // tears down presence state momentarily and breaks the typing indicator
    // for the remote user. Threshold of 30s catches real sleep/background
    // cases while letting routine mobile interruptions pass through.
    let hiddenAt: number | null = null
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible' && hiddenAt != null) {
        const hiddenForMs = Date.now() - hiddenAt
        hiddenAt = null
        if (hiddenForMs > 30000) setRtGen((g) => g + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])
}
