import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CreateGroupForm from './CreateGroupForm'

export const metadata = { title: 'Create Group — BikerOrNot' }

export default async function NewGroupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/groups" className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-white">Create Group</h1>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <CreateGroupForm />
      </div>
    </div>
  )
}
