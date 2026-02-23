import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import ProfilePhotoUpload from './ProfilePhotoUpload'
import CoverPhotoUpload from './CoverPhotoUpload'
import ProfileTabs from './ProfileTabs'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return { title: `@${username} — BikerOrNot` }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isOwnProfile = user?.id === profile.id

  const { data: currentUserProfile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const { data: bikes } = await supabase
    .from('user_bikes')
    .select('*')
    .eq('user_id', profile.id)
    .order('year', { ascending: false })

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url)
    : null

  const coverUrl = profile.cover_photo_url
    ? getImageUrl('covers', profile.cover_photo_url)
    : null

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const relationshipLabel: Record<string, string> = {
    single: 'Single',
    in_a_relationship: 'In a Relationship',
    its_complicated: "It's Complicated",
  }

  const relationshipEmoji: Record<string, string> = {
    single: '🟢',
    in_a_relationship: '💑',
    its_complicated: '🤷',
  }

  const displayName =
    profile.display_name ?? `${profile.first_name} ${profile.last_name}`

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Cover photo */}
      <div className="relative w-full h-48 md:h-64 bg-zinc-800 overflow-hidden">
        {coverUrl && (
          <Image
            src={coverUrl}
            alt="Cover photo"
            fill
            className="object-cover"
            priority
          />
        )}
        {isOwnProfile && <CoverPhotoUpload userId={profile.id} />}
      </div>

      {/* Profile body */}
      <div className="max-w-4xl mx-auto px-4">
        {/* Avatar + name row */}
        <div className="flex flex-wrap items-end gap-4 -mt-16 mb-4">
          {/* Avatar */}
          <div className="relative w-32 h-32 rounded-full border-4 border-zinc-950 bg-zinc-800 overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-600">
                {profile.first_name[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            {isOwnProfile && <ProfilePhotoUpload userId={profile.id} />}
          </div>

          {/* Name + username */}
          <div className="flex-1 min-w-0 pb-2">
            <h1 className="text-2xl font-bold text-white truncate">{displayName}</h1>
            <p className="text-zinc-400 text-sm">@{profile.username}</p>
          </div>

          {/* Action buttons */}
          <div className="pb-2 flex gap-2">
            {isOwnProfile ? (
              <Link
                href="/settings"
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
              >
                Edit Profile
              </Link>
            ) : (
              <>
                <button className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                  Add Friend
                </button>
                <button className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700">
                  Message
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-5 text-sm text-zinc-400 mb-4">
          <span>
            <span className="text-white font-semibold">0</span> Friends
          </span>
          <span>
            <span className="text-white font-semibold">0</span> Posts
          </span>
          <span>
            Member since <span className="text-white">{memberSince}</span>
          </span>
        </div>

        {/* Info card */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 mb-4 space-y-3">
          {profile.bio && (
            <p className="text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>
          )}

          {profile.location && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>📍</span>
              <span>{profile.location}</span>
            </div>
          )}

          {profile.relationship_status && (
            <div>
              <span className="inline-flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium px-3 py-1 rounded-full">
                {relationshipEmoji[profile.relationship_status]}
                {relationshipLabel[profile.relationship_status]}
              </span>
            </div>
          )}

          {profile.riding_style && profile.riding_style.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {profile.riding_style.map((style: string) => (
                <span
                  key={style}
                  className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-medium px-3 py-1 rounded-full"
                >
                  {style}
                </span>
              ))}
            </div>
          )}

          {bikes && bikes.length > 0 && (
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Garage
              </p>
              <ul className="space-y-1">
                {bikes.map((bike) => (
                  <li
                    key={bike.id}
                    className="flex items-center gap-2 text-sm text-zinc-300"
                  >
                    <span>🏍</span>
                    {bike.year} {bike.make} {bike.model}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!profile.bio && !profile.location && !profile.relationship_status &&
            (!profile.riding_style || profile.riding_style.length === 0) &&
            (!bikes || bikes.length === 0) && (
            <p className="text-zinc-500 text-sm text-center py-2">No profile info yet.</p>
          )}
        </div>

        {/* Tabs */}
        <ProfileTabs
          profileId={profile.id}
          isOwnProfile={isOwnProfile}
          currentUserId={user?.id}
          currentUserProfile={currentUserProfile}
        />

        <div className="h-12" />
      </div>
    </div>
  )
}
