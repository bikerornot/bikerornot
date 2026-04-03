import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import CreateEventForm from './CreateEventForm'

export const metadata = { title: 'Create Event — BikerOrNot' }

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; type?: string }>
}) {
  const { group: groupId, type: initialType } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  // Get user's groups for the group selector
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: memberships } = await admin
    .from('group_members')
    .select('group_id, group:groups!group_id(id, name, slug)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const userGroups = (memberships ?? [])
    .map((m: any) => m.group)
    .filter(Boolean)
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/events" className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-white">Create Event or Ride</h1>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <CreateEventForm
          userGroups={userGroups}
          preselectedGroupId={groupId}
          initialType={initialType === 'ride' ? 'ride' : initialType === 'event' ? 'event' : undefined}
        />
      </div>
    </div>
  )
}
