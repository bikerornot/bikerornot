import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import CounterNoticeForm from './CounterNoticeForm'

export const metadata = {
  title: 'DMCA Counter-Notice — BikerOrNot',
}

export default async function CounterNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>
}) {
  const { url } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let prefillName = ''
  let prefillEmail = ''

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()
    if (profile) {
      prefillName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
    }
    prefillEmail = user.email ?? ''
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Biker<span className="text-orange-500">Or</span>Not
          </Link>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href="/dmca" className="hover:text-white transition-colors">DMCA Policy</Link>
            {user ? (
              <Link href="/feed" className="hover:text-white transition-colors">Back to feed</Link>
            ) : (
              <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Page header */}
        <div className="mb-8">
          <Link
            href="/dmca"
            className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            DMCA Policy
          </Link>
          <h1 className="text-3xl font-black text-white mb-2">DMCA Counter-Notice</h1>
          <p className="text-zinc-400 leading-relaxed">
            Use this form if you believe your content was removed in error. This is a legal
            document submitted under penalty of perjury — please read all statements carefully.
          </p>
        </div>

        <CounterNoticeForm
          prefillName={prefillName}
          prefillEmail={prefillEmail}
          prefillUrl={url ?? ''}
        />
      </main>
    </div>
  )
}
