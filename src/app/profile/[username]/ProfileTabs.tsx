'use client'

import { useState } from 'react'
import { Profile, UserBike } from '@/lib/supabase/types'
import WallTab from './WallTab'
import FriendsTab from './FriendsTab'
import GarageTab from './GarageTab'
import PhotosTab from './PhotosTab'

const TABS = ['Wall', 'Photos', 'Friends', 'Garage'] as const
type Tab = (typeof TABS)[number]

interface Props {
  profileId: string
  isOwnProfile: boolean
  isFriend: boolean
  currentUserId?: string
  currentUserProfile?: Profile | null
  initialBikes: UserBike[]
  ownerCounts: Record<string, number>
  defaultTab?: string
}

export default function ProfileTabs({
  profileId,
  isOwnProfile,
  isFriend,
  currentUserId,
  currentUserProfile,
  initialBikes,
  ownerCounts,
  defaultTab,
}: Props) {
  const resolvedDefault: Tab =
    TABS.includes(defaultTab as Tab) ? (defaultTab as Tab) : 'Wall'
  const [active, setActive] = useState<Tab>(resolvedDefault)

  return (
    <div>
      <div className="flex border-b border-zinc-800 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === 'Wall' && (
        <WallTab
          profileId={profileId}
          isOwnProfile={isOwnProfile}
          isFriend={isFriend}
          currentUserId={currentUserId}
          currentUserProfile={currentUserProfile}
        />
      )}

      {active === 'Photos' && (
        <PhotosTab
          profileId={profileId}
          currentUserId={currentUserId}
          currentUserProfile={currentUserProfile}
        />
      )}

      {active === 'Friends' && (
        <FriendsTab profileId={profileId} isOwnProfile={isOwnProfile} />
      )}

      {active === 'Garage' && (
        <GarageTab isOwnProfile={isOwnProfile} initialBikes={initialBikes} ownerCounts={ownerCounts} />
      )}
    </div>
  )
}
