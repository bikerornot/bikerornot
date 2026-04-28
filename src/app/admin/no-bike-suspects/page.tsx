import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import { getNoBikeSuspects } from '@/app/actions/admin'

export const metadata = { title: 'No-Bike Suspects — BikerOrNot Admin' }
export const dynamic = 'force-dynamic'

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function riskBadge(msgCount: number) {
  if (msgCount >= 20) return <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">CRITICAL · 67%</span>
  if (msgCount >= 6) return <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">HIGH · 28%</span>
  return <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">ELEVATED · 19%</span>
}

export default async function NoBikeSuspectsPage() {
  const suspects = await getNoBikeSuspects()

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white">Probable Scammers — No Bike Heuristic</h1>
        <p className="text-zinc-400 text-sm mt-1 leading-relaxed">
          Active male users with no bike in their garage who have sent at least one message.
          Historical ban rates by message volume: <span className="text-yellow-400 font-semibold">19% (1–5 msgs)</span>,{' '}
          <span className="text-orange-400 font-semibold">28% (6–20)</span>,{' '}
          <span className="text-red-400 font-semibold">67% (20+)</span>. Sorted by message count, most active first.
        </p>
      </div>

      {suspects.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-emerald-400 text-lg mb-1">No suspects right now</p>
          <p className="text-zinc-500 text-sm">No active male users with empty garages and outbound messages.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">{suspects.length} flagged</p>

          {suspects.map((s) => {
            const avatarUrl = s.profile_photo_url ? getImageUrl('avatars', s.profile_photo_url) : null
            const location = [s.city, s.state].filter(Boolean).join(', ')

            return (
              <Link
                key={s.id}
                href={`/admin/users/${s.id}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-700 flex-shrink-0 overflow-hidden">
                    {avatarUrl ? (
                      <Image src={avatarUrl} alt="" width={48} height={48} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                        {(s.username?.[0] ?? s.first_name?.[0] ?? '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">@{s.username ?? 'unknown'}</span>
                      <span className="text-zinc-500 text-sm">{s.first_name} {s.last_name}</span>
                      {riskBadge(Number(s.message_count))}
                    </div>
                    <p className="text-zinc-500 text-xs mt-1">
                      {location ? `${location} · ` : ''}{s.signup_country ?? '—'} · joined {formatTimeAgo(s.created_at)}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                      <span><span className="text-orange-400 font-semibold">{s.message_count}</span> messages sent</span>
                      <span><span className="text-orange-400 font-semibold">{s.unique_recipients}</span> unique recipients</span>
                      <span><span className="text-orange-400 font-semibold">{s.friend_request_count}</span> friend reqs sent</span>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
