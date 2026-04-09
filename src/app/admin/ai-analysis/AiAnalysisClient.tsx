'use client'

import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import type { SuspiciousProfile } from '@/app/actions/ai-analysis'

interface Props {
  initialProfiles: SuspiciousProfile[]
}

function riskBadge(score: number) {
  if (score >= 70) return <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">High</span>
  if (score >= 50) return <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">Medium</span>
  return <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">Low</span>
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AiAnalysisClient({ initialProfiles }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">AI Analysis</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Flagged profiles based on behavior patterns — new accounts with high messaging, low posting, and gender-targeted outreach.
        </p>
      </div>

      {initialProfiles.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-emerald-400 text-lg mb-1">All clear</p>
          <p className="text-zinc-500 text-sm">No suspicious patterns detected in the last 14 days.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">{initialProfiles.length} profile{initialProfiles.length !== 1 ? 's' : ''} flagged</p>

          {initialProfiles.map((p) => {
            const avatarUrl = p.profilePhotoUrl ? getImageUrl('avatars', p.profilePhotoUrl) : null
            const location = [p.city, p.state].filter(Boolean).join(', ')
            const genderTarget = p.messagedMen > 0 && p.messagedWomen === 0
              ? 'Only men'
              : p.messagedWomen > 0 && p.messagedMen === 0
              ? 'Only women'
              : `${p.messagedMen} men, ${p.messagedWomen} women`

            return (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <Link href={`/admin/users/${p.id}`} className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-zinc-700 overflow-hidden">
                      {avatarUrl ? (
                        <Image src={avatarUrl} alt="" width={48} height={48} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                          {(p.username?.[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/admin/users/${p.id}`} className="text-white font-semibold hover:text-orange-400 transition-colors">
                        @{p.username}
                      </Link>
                      {riskBadge(p.riskScore)}
                      {!p.verified && (
                        <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Unverified</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-zinc-400">
                      <span>{p.gender === 'female' ? 'Female' : p.gender === 'male' ? 'Male' : '—'}</span>
                      {location && <span>{location}</span>}
                      <span>Joined {formatDate(p.joined)}</span>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                      <span className="text-zinc-300">
                        <span className="font-semibold text-white">{p.messagesSent}</span> msgs sent
                      </span>
                      <span className="text-zinc-300">
                        <span className="font-semibold text-white">{p.conversations}</span> convos
                      </span>
                      <span className="text-zinc-300">
                        <span className="font-semibold text-white">{p.posts}</span> posts
                      </span>
                    </div>

                    {/* Gender targeting */}
                    <div className="mt-1.5 text-sm">
                      <span className={`font-medium ${
                        (p.messagedMen > 0 && p.messagedWomen === 0) || (p.messagedWomen > 0 && p.messagedMen === 0)
                          ? 'text-orange-400' : 'text-zinc-400'
                      }`}>
                        Messaging: {genderTarget}
                      </span>
                    </div>
                  </div>

                  {/* Risk score */}
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-2xl font-bold ${
                      p.riskScore >= 70 ? 'text-red-400' : p.riskScore >= 50 ? 'text-orange-400' : 'text-yellow-400'
                    }`}>{p.riskScore}</p>
                    <p className="text-xs text-zinc-500">risk</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
