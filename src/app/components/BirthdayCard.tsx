'use client'

import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import type { BirthdayFriend } from '@/app/actions/friends'

interface Props {
  birthdays: BirthdayFriend[]
}

export default function BirthdayCard({ birthdays }: Props) {
  if (birthdays.length === 0) return null

  return (
    <div className="bg-zinc-900 sm:rounded-xl sm:border sm:border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🎂</span>
        <p className="text-white text-sm font-semibold">
          {birthdays.length === 1
            ? 'A friend has a birthday today!'
            : `${birthdays.length} friends have birthdays today!`}
        </p>
      </div>
      <div className="space-y-3">
        {birthdays.map((friend) => {
          const photo = friend.profile_photo_url
            ? getImageUrl('avatars', friend.profile_photo_url)
            : null

          return (
            <div key={friend.id} className="flex items-center gap-3">
              <Link href={`/profile/${friend.username}`} className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                  {photo ? (
                    <Image
                      src={photo}
                      alt=""
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-sm">
                      {(friend.username?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${friend.username}`} className="hover:underline">
                  <span className="text-white text-sm font-medium">@{friend.username}</span>
                </Link>
                <p className="text-zinc-500 text-xs">Wish them a happy birthday!</p>
              </div>
              <Link
                href={`/profile/${friend.username}`}
                className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                View Profile
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
