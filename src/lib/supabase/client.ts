import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton so every component shares one websocket and one auth context.
// @supabase/ssr's createBrowserClient does NOT automatically push the user's
// access token to the Realtime socket — without setAuth the subscription
// runs with the anon key, auth.uid() returns null inside RLS, and every
// postgres_changes event is silently filtered out by the SELECT policies on
// messages / comments / notifications / etc. The observed symptom: messages
// arrive in the DB fine, but recipients only see them after a full page
// refresh (which re-fetches via authenticated REST, not via realtime).
let singleton: SupabaseClient | null = null

export function createClient() {
  if (singleton) return singleton

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Push the current session's access token to Realtime so RLS sees
  // auth.uid() correctly for channel subscriptions. Fires and forgets — if
  // there's no session yet (logged-out user), setAuth(null) is fine.
  client.auth.getSession().then(({ data: { session } }) => {
    client.realtime.setAuth(session?.access_token ?? null)
  })

  // Keep Realtime auth in sync when the access token refreshes (every hour
  // by default) or the user signs in/out in another tab. Without this, a
  // token refresh silently invalidates all active subscriptions.
  client.auth.onAuthStateChange((_event, session) => {
    client.realtime.setAuth(session?.access_token ?? null)
  })

  singleton = client
  return client
}
