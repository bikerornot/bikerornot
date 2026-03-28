import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import Link from 'next/link'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getListingDetail } from '@/app/actions/classifieds'
import ListingDetailClient from './ListingDetailClient'

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const listing = await getListingDetail(id)
  if (!listing) notFound()

  // Record view inline (not in after() — Vercel serverless may not execute after() reliably)
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  Promise.resolve(
    admin.rpc('increment_listing_view', {
      p_listing_id: id,
      p_viewer_id: user?.id ?? null,
    })
  ).catch(() => {})

  let profile = null
  let avatarUrl = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
    if (profile?.profile_photo_url) {
      avatarUrl = getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      {user && <LastSeenTracker />}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            {user && profile ? (
              <>
                <DesktopNav />
                <MessagesLink userId={user.id} />
                <NotificationBell userId={user.id} username={profile.username!} />
                <UserMenu
                  username={profile.username!}
                  displayName={profile.username ?? 'Unknown'}
                  avatarUrl={avatarUrl}
                  firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
                  role={profile.role}
                />
              </>
            ) : (
              <Link href="/login" className="text-sm text-orange-400 hover:text-orange-300 font-medium">Log In</Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <ListingDetailClient listing={listing} currentUserId={user?.id ?? null} />
      </div>
      {user && <BottomNav />}
    </div>
  )
}
