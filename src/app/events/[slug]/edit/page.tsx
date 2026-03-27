import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getEvent } from '@/app/actions/events'
import EditEventForm from './EditEventForm'

export const metadata = { title: 'Edit Event — BikerOrNot' }

export default async function EditEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const event = await getEvent(slug)
  if (!event) notFound()
  if (event.creator_id !== user.id) redirect(`/events/${slug}`)

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/events/${slug}`} className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-white">Edit {event.type === 'ride' ? 'Ride' : 'Event'}</h1>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <EditEventForm event={event} />
      </div>
    </div>
  )
}
