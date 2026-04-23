'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { getImageUrl } from '@/lib/supabase/image'
import { avatarColorFor, avatarInitials } from '@/lib/avatar-color'
import FriendButton, { type FriendshipStatus } from '@/app/profile/[username]/FriendButton'
import MessageButton from '@/app/components/MessageButton'
import ContentMenu from '@/app/components/ContentMenu'
import BikeWall from '@/app/garage/[username]/BikeWall'
import { sendFriendRequest, cancelFriendRequest, acceptFriendRequest, declineFriendRequest } from '@/app/actions/friends'
import type { Profile } from '@/lib/supabase/types'

export interface BikeDetailOwnerCard {
  id: string
  username: string | null
  firstName: string
  avatarUrl: string | null
  city: string | null
  state: string | null
  mutualCount: number
  friendshipStatus: FriendshipStatus
}

interface Props {
  bikeId: string
  bikeYear: number | null
  bikeMake: string | null
  bikeModel: string | null
  photoPaths: string[]
  owner: {
    id: string
    username: string | null
    firstName: string
    avatarUrl: string | null
  }
  isOwnBike: boolean
  friendshipStatus: FriendshipStatus
  otherOwners: BikeDetailOwnerCard[]
  totalOtherOwners: number
  viewerId: string
  viewerProfile: Profile | null
}

const OWNERS_INITIAL_VISIBLE = 6

export default function BikeDetailClient({
  bikeId,
  bikeYear,
  bikeMake,
  bikeModel,
  photoPaths,
  owner,
  isOwnBike,
  friendshipStatus,
  otherOwners,
  totalOtherOwners,
  viewerId,
  viewerProfile,
}: Props) {
  const router = useRouter()
  const [photoIndex, setPhotoIndex] = useState(0)
  const [ownersExpanded, setOwnersExpanded] = useState(false)

  const bikeName = [bikeYear, bikeMake, bikeModel].filter(Boolean).join(' ')
  const hasPhotos = photoPaths.length > 0
  const hasMultiplePhotos = photoPaths.length > 1
  const currentPhoto = hasPhotos ? photoPaths[photoIndex] : null

  const ownerHandle = owner.username ?? 'user'
  const visibleOwners = ownersExpanded ? otherOwners : otherOwners.slice(0, OWNERS_INITIAL_VISIBLE)

  function handleBack() {
    // Prefer history back when available (keeps scroll position on the
    // previous page), fall back to the owner's profile garage tab.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(`/profile/${ownerHandle}?tab=Garage`)
  }

  return (
    <div className="space-y-4">
      {/* In-page header: back + owner's garage handle + ellipsis menu */}
      <div className="flex items-center justify-between px-4 sm:px-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleBack}
            aria-label="Back"
            className="-ml-2 w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Link
            href={`/profile/${ownerHandle}?tab=Garage`}
            className="text-white text-base font-medium truncate hover:text-orange-400 transition-colors"
          >
            @{ownerHandle}&apos;s garage
          </Link>
        </div>

        {viewerId !== owner.id ? (
          <ContentMenu
            reportType="profile"
            reportTargetId={owner.id}
            blockUserId={owner.id}
          />
        ) : null}
      </div>

      {/* Hero — photo carousel */}
      <div className="relative bg-zinc-900 sm:rounded-xl overflow-hidden">
        <div className="aspect-[4/3] w-full bg-zinc-800 flex items-center justify-center">
          {currentPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={getImageUrl('bikes', currentPhoto)}
              alt={bikeName || 'Bike photo'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center text-zinc-600">
              <span className="text-5xl">🏍️</span>
              <span className="text-sm mt-2">No photo yet</span>
            </div>
          )}
        </div>

        {hasMultiplePhotos && (
          <>
            {/* Dots */}
            <div className="absolute left-0 right-0 bottom-3 flex justify-center gap-1.5">
              {photoPaths.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === photoIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
            {/* Counter */}
            <div className="absolute right-3 bottom-3 bg-black/60 text-white text-xs font-medium px-2 py-1 rounded-full">
              {photoIndex + 1} / {photoPaths.length}
            </div>
          </>
        )}
      </div>

      {/* Title */}
      <div className="px-4 sm:px-0">
        {(bikeYear || bikeMake) && (
          <div className="text-orange-400 text-sm font-medium">
            {[bikeYear, bikeMake].filter(Boolean).join(' · ')}
          </div>
        )}
        <h1 className="text-white text-2xl font-bold leading-tight">
          {bikeModel || bikeName || 'Bike'}
        </h1>
      </div>

      {/* Owner attribution strip */}
      <div className="mx-4 sm:mx-0 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 flex items-center gap-3">
        <Link
          href={`/profile/${ownerHandle}`}
          className="flex items-center gap-3 min-w-0 flex-1 group"
        >
          <OwnerAvatar
            avatarUrl={owner.avatarUrl}
            username={owner.username}
            firstName={owner.firstName}
            size={40}
          />
          <div className="min-w-0">
            <p className="text-zinc-500 text-xs">In the garage of</p>
            <p className="text-white font-medium truncate group-hover:text-orange-400 transition-colors">
              @{ownerHandle}
            </p>
          </div>
        </Link>

        {/* State-aware action */}
        <div className="flex gap-2 flex-shrink-0">
          {isOwnBike ? (
            <Link
              href={`/profile/${ownerHandle}?tab=Garage`}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Edit
            </Link>
          ) : (
            <>
              {friendshipStatus === 'accepted' ? (
                <MessageButton profileId={owner.id} />
              ) : (
                <FriendButton profileId={owner.id} initialStatus={friendshipStatus} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Posts about this bike */}
      <div className="px-4 sm:px-0">
        <h2 className="text-white text-lg font-semibold mb-3">Posts about this bike</h2>
        <BikeWall
          bikeId={bikeId}
          isOwnGarage={isOwnBike}
          isFriend={friendshipStatus === 'accepted'}
          garageOwnerId={owner.id}
          currentUserId={viewerId}
          currentUserProfile={viewerProfile}
        />
      </div>

      {/* Other owners */}
      {totalOtherOwners > 0 && (
        <div className="px-4 sm:px-0 pt-2">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-white text-lg font-semibold">Other owners</h2>
            {totalOtherOwners > OWNERS_INITIAL_VISIBLE && !ownersExpanded && (
              <button
                onClick={() => setOwnersExpanded(true)}
                className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
              >
                See all {totalOtherOwners}
              </button>
            )}
          </div>
          {bikeMake && (
            <p className="text-zinc-500 text-sm mb-3">
              Riders with a{' '}
              {[bikeYear, bikeMake, bikeModel].filter(Boolean).join(' ')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {visibleOwners.map((o) => (
              <OwnerCard key={o.id} owner={o} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerAvatar({
  avatarUrl,
  username,
  firstName,
  size,
}: {
  avatarUrl: string | null
  username: string | null
  firstName: string | null
  size: number
}) {
  const initials = avatarInitials(firstName, username)
  const fallbackColor = avatarColorFor(username ?? firstName ?? initials)
  return (
    <div
      className="rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, backgroundColor: avatarUrl ? undefined : fallbackColor }}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={username ?? 'User'}
          width={size}
          height={size}
          className="object-cover w-full h-full"
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.4) }}>{initials}</span>
      )}
    </div>
  )
}

function OwnerCard({ owner }: { owner: BikeDetailOwnerCard }) {
  const location = [owner.city, owner.state].filter(Boolean).join(', ')
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center gap-2">
      <Link
        href={`/profile/${owner.username}`}
        className="flex flex-col items-center gap-1.5 w-full min-w-0"
      >
        <OwnerAvatar
          avatarUrl={owner.avatarUrl}
          username={owner.username}
          firstName={owner.firstName}
          size={56}
        />
        <p className="text-white text-sm font-semibold truncate w-full text-center">
          @{owner.username ?? 'user'}
        </p>
        {location && (
          <p className="text-zinc-500 text-xs truncate w-full text-center">{location}</p>
        )}
        {owner.friendshipStatus === 'accepted' ? (
          <p className="text-emerald-400 text-xs font-medium">Friends</p>
        ) : owner.mutualCount > 0 ? (
          <p className="text-orange-400 text-xs font-medium">
            {owner.mutualCount} mutual friend{owner.mutualCount === 1 ? '' : 's'}
          </p>
        ) : (
          <p className="text-xs text-zinc-600">&nbsp;</p>
        )}
      </Link>
      <OwnerAction owner={owner} />
    </div>
  )
}

// Inline friend/message action button. Kept local to the card so each one
// reflects its own state without forcing a parent re-render; uses the same
// server actions as the global FriendButton but in a compact layout.
function OwnerAction({ owner }: { owner: BikeDetailOwnerCard }) {
  const [status, setStatus] = useState<FriendshipStatus>(owner.friendshipStatus)
  const [loading, setLoading] = useState(false)

  async function run(
    action: () => Promise<void | { error?: string }>,
    next: FriendshipStatus,
  ) {
    const prev = status
    setStatus(next)
    setLoading(true)
    try {
      const r = await action()
      if (r && typeof r === 'object' && 'error' in r && r.error) {
        setStatus(prev)
        alert(r.error)
      }
    } catch (err) {
      setStatus(prev)
      alert(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'accepted') {
    return (
      <div className="w-full [&>div]:w-full [&_button]:w-full [&_button]:py-1.5 [&_button]:px-3">
        <MessageButton profileId={owner.id} variant="outlined" />
      </div>
    )
  }
  if (status === 'pending_sent') {
    return (
      <button
        onClick={() => run(() => cancelFriendRequest(owner.id), 'none')}
        disabled={loading}
        className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-semibold py-1.5 rounded-lg transition-colors"
      >
        Requested
      </button>
    )
  }
  if (status === 'pending_received') {
    return (
      <div className="flex gap-1.5 w-full">
        <button
          onClick={() => run(() => acceptFriendRequest(owner.id), 'accepted')}
          disabled={loading}
          className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold py-1.5 rounded-lg transition-colors"
        >
          Accept
        </button>
        <button
          onClick={() => run(() => declineFriendRequest(owner.id), 'none')}
          disabled={loading}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-semibold py-1.5 rounded-lg transition-colors"
        >
          Decline
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={() => run(() => sendFriendRequest(owner.id), 'pending_sent')}
      disabled={loading}
      className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold py-1.5 rounded-lg transition-colors"
    >
      Add friend
    </button>
  )
}
