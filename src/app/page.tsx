import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Phase 4 will replace this with the authenticated home feed.
// For now: redirect logged-in users to their profile, show landing page to visitors.
export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, onboarding_complete')
      .eq('id', user.id)
      .single()

    if (profile && !profile.onboarding_complete) {
      redirect('/onboarding')
    }

    if (profile?.username) {
      redirect('/feed')
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
      <div className="text-6xl mb-6">🏍️</div>
      <h1 className="text-4xl font-bold text-white mb-3">
        Biker<span className="text-orange-500">OrNot</span>
      </h1>
      <p className="text-zinc-400 text-lg mb-10 max-w-md">
        The social network built for motorcycle enthusiasts. Share your rides, meet your tribe.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Join BikerOrNot
        </Link>
        <Link
          href="/login"
          className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
