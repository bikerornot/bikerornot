import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HomeLoginForm from './HomeLoginForm'

export const metadata = {
  title: 'BikerOrNot — The Social Network for Bikers',
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, onboarding_complete')
      .eq('id', user.id)
      .single()

    if (profile && !profile.onboarding_complete) redirect('/onboarding')
    if (profile?.username) redirect('/feed')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Glow accents */}
        <div className="absolute -top-20 -left-40 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-orange-500/8 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 w-full py-16 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left — branding + CTA */}
          <div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-none tracking-tight mb-5">
              Biker<span className="text-orange-500">Or</span>Not
            </h1>
            <p className="text-2xl sm:text-3xl font-bold text-zinc-200 leading-snug mb-4">
              The Social Network<br className="hidden sm:block" /> for Bikers.
            </p>
            <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-10 max-w-md">
              Connect with riders near you. Share your rides, show off your garage, and find your tribe.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl transition-colors text-lg shadow-lg shadow-orange-500/20"
            >
              Join Free
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>

          {/* Right — inline login */}
          <div>
            <HomeLoginForm />
          </div>

        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-zinc-800/60 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-3xl sm:text-4xl font-black text-white mb-4">
            Everything riders need
          </h2>
          <p className="text-center text-zinc-500 mb-14 text-base max-w-md mx-auto">
            One place built specifically for the motorcycle community.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-7 hover:border-zinc-700 transition-colors">
              <div className="text-4xl mb-5">👥</div>
              <h3 className="font-bold text-white text-lg mb-2">Find Your Tribe</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Discover riders near you, send friend requests, and join groups built around your riding style.
              </p>
            </div>
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-7 hover:border-zinc-700 transition-colors">
              <div className="text-4xl mb-5">🔧</div>
              <h3 className="font-bold text-white text-lg mb-2">Show Your Garage</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Add your bikes, upload photos, and find every other rider who owns the exact same machine.
              </p>
            </div>
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-7 hover:border-zinc-700 transition-colors">
              <div className="text-4xl mb-5">📸</div>
              <h3 className="font-bold text-white text-lg mb-2">Share Every Ride</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Post photos and stories from every ride. Like, comment, and keep your crew in the loop.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="border-t border-zinc-800/60 py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[500px] h-[200px] bg-orange-500/10 rounded-full blur-[100px]" />
        </div>
        <div className="relative">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
            Ready to roll?
          </h2>
          <p className="text-zinc-400 text-lg mb-8">
            Join the community. It&apos;s free.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl transition-colors text-lg shadow-lg shadow-orange-500/20"
          >
            Join BikerOrNot
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800/60 py-8 px-6 text-center">
        <p className="text-zinc-600 text-sm">
          © {new Date().getFullYear()} BikerOrNot. Built for riders, by riders.
          {' · '}
          <Link href="/dmca" className="hover:text-zinc-400 transition-colors">DMCA Policy</Link>
          {' · '}
          <a href="mailto:dmca@bikerornot.com" className="hover:text-zinc-400 transition-colors">
            dmca@bikerornot.com
          </a>
        </p>
      </footer>

    </div>
  )
}
