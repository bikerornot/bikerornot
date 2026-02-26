import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cancelAccountDeletion } from '@/app/actions/account'

export const metadata = { title: 'Account Scheduled for Deletion — BikerOrNot' }

export default async function ReactivatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, deletion_scheduled_at, deactivated_at')
    .eq('id', user.id)
    .single()

  // No pending deletion — send them home
  if (!profile?.deletion_scheduled_at) redirect('/feed')

  const deletionDate = new Date(profile.deletion_scheduled_at)
  const daysLeft = Math.ceil((deletionDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const formattedDate = deletionDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-black tracking-tight text-white">
            Biker<span className="text-orange-500">Or</span>Not
          </Link>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          {/* Icon */}
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h1 className="text-white text-xl font-bold text-center mb-2">
            Account deletion scheduled
          </h1>
          <p className="text-zinc-400 text-sm text-center leading-relaxed mb-1">
            Your account is scheduled for permanent deletion on
          </p>
          <p className="text-red-400 font-semibold text-center mb-4">{formattedDate}</p>

          {/* Countdown */}
          <div className="bg-zinc-800 rounded-xl px-4 py-3 text-center mb-6">
            <span className="text-3xl font-black text-white">{Math.max(0, daysLeft)}</span>
            <span className="text-zinc-400 text-sm ml-2">
              {daysLeft === 1 ? 'day' : 'days'} remaining
            </span>
          </div>

          <p className="text-zinc-500 text-xs text-center leading-relaxed mb-6">
            After this date, your profile, posts, photos, messages, and all other data will be
            permanently and irreversibly deleted. Changed your mind? Cancel now to restore
            your account immediately.
          </p>

          {/* Cancel deletion CTA */}
          <form action={cancelAccountDeletion}>
            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-colors text-sm mb-3"
            >
              Cancel deletion — keep my account
            </button>
          </form>

          {/* Sign out */}
          <form action={async () => {
            'use server'
            const supabase = await createClient()
            await supabase.auth.signOut()
            redirect('/')
          }}>
            <button
              type="submit"
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              Sign out
            </button>
          </form>
        </div>

        <p className="text-zinc-600 text-xs text-center mt-6 leading-relaxed">
          If you believe this deletion was not requested by you, contact us immediately at{' '}
          <a href="mailto:support@bikerornot.com" className="text-zinc-400 hover:text-white transition-colors">
            support@bikerornot.com
          </a>
        </p>
      </div>
    </div>
  )
}
