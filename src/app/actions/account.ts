'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Temporarily hide the account. Clears automatically when the user logs back in. */
export async function deactivateAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await getAdmin()
    .from('profiles')
    .update({ deactivated_at: new Date().toISOString() })
    .eq('id', user.id)

  await supabase.auth.signOut()
  redirect('/')
}

/** Schedule permanent deletion 30 days from now and deactivate immediately. */
export async function scheduleAccountDeletion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const deletionDate = new Date()
  deletionDate.setDate(deletionDate.getDate() + 30)

  await getAdmin()
    .from('profiles')
    .update({
      deactivated_at: new Date().toISOString(),
      deletion_scheduled_at: deletionDate.toISOString(),
    })
    .eq('id', user.id)

  await supabase.auth.signOut()
  redirect('/')
}

/** Cancel a scheduled deletion and reactivate the account. */
export async function cancelAccountDeletion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await getAdmin()
    .from('profiles')
    .update({ deactivated_at: null, deletion_scheduled_at: null })
    .eq('id', user.id)

  redirect('/feed')
}

/** Clear deactivated_at when a previously-deactivated user logs back in. */
export async function reactivateAccount(userId: string) {
  await getAdmin()
    .from('profiles')
    .update({ deactivated_at: null })
    .eq('id', userId)
}
