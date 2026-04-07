import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import MessagesLink from '@/app/components/MessagesLink'
import FindRidersLink from '@/app/components/FindRidersLink'
import BottomNav from '@/app/components/BottomNav'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import { getEvent, getEventAttendees } from '@/app/actions/events'
import EventDetailClient from './EventDetailClient'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getEvent(slug)
  return { title: event ? `${event.title} — BikerOrNot` : 'Event — BikerOrNot' }
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const event = await getEvent(slug)
  if (!event) notFound()

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch upcoming dates for recurring events
  let upcomingDates: string[] = []
  if (event.recurrence_rule) {
    const { data: instances } = await admin
      .from('events')
      .select('starts_at')
      .eq('recurrence_parent_id', event.id)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
    upcomingDates = (instances ?? []).map((i) => i.starts_at)
  }

  const [goingAttendees, interestedAttendees] = await Promise.all([
    getEventAttendees(event.id, 'going'),
    getEventAttendees(event.id, 'interested'),
  ])

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  const coverUrl = event.cover_photo_url
    ? getImageUrl('covers', event.cover_photo_url)
    : null

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <DesktopNav />
            <FindRidersLink />
            <MessagesLink userId={user.id} />
            <NotificationBell userId={user.id} username={profile.username!} />
            <UserMenu
              username={profile.username!}
              displayName={profile.username ?? 'Unknown'}
              avatarUrl={avatarUrl}
              firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
              role={profile.role}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto">
        {/* Cover photo */}
        {coverUrl ? (
          <div className="relative w-full aspect-[3/1] bg-zinc-800">
            <Image src={coverUrl} alt={event.title} fill className="object-cover" sizes="(max-width: 640px) 100vw, 672px" />
          </div>
        ) : (
          <div className="w-full h-32 bg-gradient-to-r from-orange-500/20 to-zinc-900" />
        )}

        <EventDetailClient
          event={event}
          currentUserId={user.id}
          goingAttendees={goingAttendees}
          interestedAttendees={interestedAttendees}
          upcomingDates={upcomingDates}
        />
      </div>
      <BottomNav />
    </div>
  )
}
