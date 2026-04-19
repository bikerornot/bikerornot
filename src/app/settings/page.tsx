import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'
import BlockedUsersSection from './BlockedUsersSection'
import { getMyBlockedUsers } from '@/app/actions/blocks'

export const metadata = { title: 'Settings — BikerOrNot' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, blocked] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    getMyBlockedUsers(),
  ])

  return (
    <div className="min-h-screen bg-zinc-950 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Profile Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Update your public profile information.
          </p>
        </div>
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <SettingsForm profile={profile!} />
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <h2 className="text-lg font-bold text-white mb-1">Blocked Users</h2>
          <p className="text-zinc-400 text-sm mb-4">
            People you've blocked won't see your posts, comments, or profile, and you won't see theirs. Unblocking lets you see each other again.
          </p>
          <BlockedUsersSection initialBlocked={blocked} />
        </div>
      </div>
    </div>
  )
}
