import { createClient as createServiceClient } from '@supabase/supabase-js'

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Insert a notification only if the actor (sender) is still active.
 * Silently skips if the actor is banned/suspended (shadow ban).
 * Supports single or batch notifications.
 */
export async function notifyIfActive(
  actorId: string,
  notifications: Record<string, unknown> | Record<string, unknown>[],
): Promise<void> {
  const admin = getAdmin()
  const { data: actor } = await admin
    .from('profiles')
    .select('status')
    .eq('id', actorId)
    .single()

  if (actor?.status !== 'active') return

  await admin.from('notifications').insert(notifications)
}
