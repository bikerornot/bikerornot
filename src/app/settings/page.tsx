import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'

export const metadata = { title: 'Settings — BikerOrNot' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: bikes } = await supabase
    .from('user_bikes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-zinc-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Profile Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Update your public profile information.
          </p>
        </div>
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <SettingsForm profile={profile!} initialBikes={bikes ?? []} />
        </div>
      </div>
    </div>
  )
}
