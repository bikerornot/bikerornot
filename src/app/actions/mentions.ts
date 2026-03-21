'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface MentionSuggestion {
  username: string
  profile_photo_url: string | null
}

/** Search friends by username prefix for @mention autocomplete */
export async function searchFriendsForMention(query: string): Promise<MentionSuggestion[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  // Get accepted friend IDs
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  if (!friendships || friendships.length === 0) return []

  const friendIds = friendships.map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )

  // Search friends by username prefix (empty query returns first 5 friends)
  let profileQuery = admin
    .from('profiles')
    .select('username, profile_photo_url')
    .in('id', friendIds)
    .eq('status', 'active')
    .is('deactivated_at', null)
    .order('username')
    .limit(5)

  if (query.length > 0) {
    profileQuery = profileQuery.ilike('username', `${query}%`)
  }

  const { data: profiles } = await profileQuery

  return (profiles ?? []).map((p) => ({
    username: p.username,
    profile_photo_url: p.profile_photo_url,
  }))
}
