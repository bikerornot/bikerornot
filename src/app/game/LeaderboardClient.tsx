'use client'

import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import type { GameStats, LeaderboardEntry } from '@/app/actions/game'
import ShareStatsButton from './ShareStatsButton'

interface Props {
  myStats: GameStats
  leaderboard: LeaderboardEntry[]
  currentUserId: string
}

export default function LeaderboardClient({ myStats, leaderboard, currentUserId }: Props) {
  const sorted = [...leaderboard]
    .sort((a, b) => b.accuracyPercent - a.accuracyPercent)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
            </svg>
            What's That Bike?
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">How well do you know your bikes?</p>
        </div>
        <Link
          href="/play"
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Play
        </Link>
      </div>

      {/* My Stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-base font-semibold text-zinc-300 uppercase tracking-wider mb-3">Your Stats</h2>
        {myStats.totalPlayed === 0 ? (
          <p className="text-zinc-500 text-sm">You haven't played yet. Find the game in your feed!</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-white">{myStats.totalPlayed}</p>
              <p className="text-sm text-zinc-400 mt-0.5">Answered</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{myStats.accuracyPercent}%</p>
              <p className="text-sm text-zinc-400 mt-0.5">Accuracy</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-400">{myStats.bestStreak}</p>
              <p className="text-sm text-zinc-400 mt-0.5">Best Streak</p>
            </div>
          </div>
        )}
        {myStats.totalPlayed > 0 && (
          <p className="text-sm text-zinc-400 mt-3 border-t border-zinc-800 pt-3">
            {myStats.rank != null ? (
              <>
                You&apos;re ranked{' '}
                <span className="text-orange-400 font-semibold">#{myStats.rank}</span>
                {myStats.totalRanked > 0 && (
                  <> of <span className="text-zinc-300 font-semibold">{myStats.totalRanked}</span></>
                )}
              </>
            ) : (
              <>
                Play{' '}
                <span className="text-orange-400 font-semibold">{myStats.gamesNeededToRank}</span>{' '}
                more {myStats.gamesNeededToRank === 1 ? 'game' : 'games'} to appear on the leaderboard
              </>
            )}
          </p>
        )}
        {myStats.totalPlayed > 0 && (
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <ShareStatsButton />
          </div>
        )}
      </div>

      {/* Top 3 podium */}
      {sorted.length >= 3 && (
        <div className="flex items-end justify-center gap-3 py-2">
          {/* 2nd place */}
          <PodiumCard entry={sorted[1]} rank={2} />
          {/* 1st place */}
          <PodiumCard entry={sorted[0]} rank={1} />
          {/* 3rd place */}
          <PodiumCard entry={sorted[2]} rank={3} />
        </div>
      )}

      {/* Leaderboard list */}
      <h2 className="text-lg font-bold text-white">Leaderboard</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-zinc-500 text-sm">No scores yet. Be the first to play!</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {sorted.map((entry, idx) => {
              const rank = idx + 1
              const isMe = entry.userId === currentUserId
              const avatarUrl = entry.profilePhotoUrl
                ? getImageUrl('avatars', entry.profilePhotoUrl)
                : null

              return (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-orange-500/5' : ''}`}
                >
                  {/* Rank */}
                  <div className={`w-7 text-center font-bold text-base flex-shrink-0 ${
                    rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-zinc-400' : rank === 3 ? 'text-amber-600' : 'text-zinc-500'
                  }`}>
                    {rank}
                  </div>

                  {/* Avatar */}
                  <Link href={`/profile/${entry.username}`} className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                      {avatarUrl ? (
                        <Image src={avatarUrl} alt="" width={40} height={40} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-sm">
                          {entry.username?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Name + games */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/profile/${entry.username}`} className="text-base font-semibold text-white hover:text-orange-400 transition-colors truncate block">
                      @{entry.username ?? 'unknown'}
                      {isMe && <span className="text-orange-400 ml-1">(you)</span>}
                    </Link>
                    <p className="text-sm text-zinc-400">{entry.totalGames} answered</p>
                  </div>

                  {/* Score */}
                  <p className="text-base font-bold text-orange-400 flex-shrink-0">{entry.accuracyPercent}%</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}

function PodiumCard({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const avatarUrl = entry.profilePhotoUrl
    ? getImageUrl('avatars', entry.profilePhotoUrl)
    : null

  const ringColor = rank === 1 ? 'ring-yellow-400' : rank === 2 ? 'ring-zinc-400' : 'ring-amber-600'
  const size = rank === 1 ? 'w-16 h-16' : 'w-12 h-12'
  const medalSize = rank === 1 ? 'text-2xl' : 'text-lg'

  return (
    <Link href={`/profile/${entry.username}`} className="flex flex-col items-center gap-1 group">
      <div className="text-center mb-0.5">
        <span className={medalSize}>
          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
        </span>
      </div>
      <div className={`${size} rounded-full overflow-hidden ring-2 ${ringColor} flex-shrink-0`}>
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={64} height={64} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-400 font-bold">
            {entry.username?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>
      <p className="text-sm text-zinc-300 group-hover:text-orange-400 transition-colors truncate max-w-[80px] text-center">
        @{entry.username ?? '?'}
      </p>
      <p className="text-base font-bold text-orange-400">{entry.accuracyPercent}%</p>
      <p className="text-sm text-zinc-400">{entry.totalGames} played</p>
    </Link>
  )
}
