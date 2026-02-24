import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
import { createClient } from '@/lib/supabase/server'
import { getUserDetail } from '@/app/actions/admin'
import { getImageUrl } from '@/lib/supabase/image'
import UserActions from './UserActions'

export const metadata = { title: 'User Detail — BikerOrNot Admin' }

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam', harassment: 'Harassment', hate_speech: 'Hate speech',
  nudity: 'Nudity', violence: 'Violence', fake_account: 'Fake account', other: 'Other',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user: adminUser } } = await supabase.auth.getUser()
  const { data: adminProfile } = await supabase
    .from('profiles').select('role').eq('id', adminUser!.id).single()

  const user = await getUserDetail(id)
  if (!user) notFound()

  const avatarUrl = user.profile_photo_url
    ? getImageUrl('avatars', user.profile_photo_url)
    : null

  const isSuperAdmin = adminProfile?.role === 'super_admin'
  const locationMismatch = user.signup_country &&
    user.signup_country !== 'United States' &&
    (user.state || user.city)

  return (
    <div className="p-6 max-w-4xl">
      {/* Back */}
      <Link
        href="/admin/users"
        className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        All users
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: profile + moderation */}
        <div className="space-y-4">
          {/* Profile card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-zinc-700 flex-shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="" width={56} height={56} className="object-cover w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                    {user.first_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{user.first_name} {user.last_name}</p>
                <p className="text-zinc-400 text-sm">@{user.username ?? 'no username'}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    user.status === 'banned' ? 'bg-red-500/20 text-red-400' :
                    user.status === 'suspended' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {user.status}
                  </span>
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                    {user.role}
                  </span>
                </div>
              </div>
            </div>

            <dl className="space-y-2 text-sm">
              {user.email && (
                <div>
                  <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Email</dt>
                  <dd className="text-zinc-300 break-all">{user.email}</dd>
                </div>
              )}
              <div>
                <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Joined</dt>
                <dd className="text-zinc-300">{formatDate(user.created_at)}</dd>
              </div>
              {(user.city || user.state) && (
                <div>
                  <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Location</dt>
                  <dd className="text-zinc-300">{[user.city, user.state].filter(Boolean).join(', ')}</dd>
                </div>
              )}
              {user.zip_code && (
                <div>
                  <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Zip Code</dt>
                  <dd className="text-zinc-300">{user.zip_code}</dd>
                </div>
              )}
              {user.bio && (
                <div>
                  <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Bio</dt>
                  <dd className="text-zinc-400 text-xs leading-relaxed">{user.bio}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* IP / Signup location */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Signup Info</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">IP Address</dt>
                <dd className="text-zinc-300 font-mono text-xs">{user.signup_ip ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">Country</dt>
                <dd className={`text-sm font-medium ${locationMismatch ? 'text-orange-400' : 'text-zinc-300'}`}>
                  {locationMismatch && '⚠ '}{user.signup_country ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">Region</dt>
                <dd className="text-zinc-300 text-sm">{user.signup_region ?? '—'}</dd>
              </div>
            </dl>
            {locationMismatch && (
              <p className="mt-3 text-xs text-orange-400/80 bg-orange-500/10 rounded-lg px-3 py-2">
                Signup country doesn't match stated location.
              </p>
            )}
          </div>

          {/* Suspension / ban info */}
          {(user.status === 'suspended' || user.status === 'banned') && (
            <div className={`border rounded-xl p-5 ${
              user.status === 'banned'
                ? 'bg-red-900/10 border-red-800/40'
                : 'bg-orange-900/10 border-orange-800/40'
            }`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                user.status === 'banned' ? 'text-red-400' : 'text-orange-400'
              }`}>
                {user.status === 'banned' ? 'Ban Details' : 'Suspension Details'}
              </h3>
              <dl className="space-y-2 text-sm">
                {user.suspension_reason && (
                  <div>
                    <dt className="text-zinc-600 text-xs mb-0.5">Reason</dt>
                    <dd className="text-zinc-300">{user.suspension_reason}</dd>
                  </div>
                )}
                {user.ban_reason && (
                  <div>
                    <dt className="text-zinc-600 text-xs mb-0.5">Reason</dt>
                    <dd className="text-zinc-300">{user.ban_reason}</dd>
                  </div>
                )}
                {user.suspended_until && (
                  <div>
                    <dt className="text-zinc-600 text-xs mb-0.5">Expires</dt>
                    <dd className="text-zinc-300">{formatDate(user.suspended_until)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Stats */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{user.post_count}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Posts</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${user.report_count > 0 ? 'text-orange-400' : 'text-white'}`}>
                  {user.report_count}
                </p>
                <p className="text-zinc-500 text-xs mt-0.5">Reports</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: actions + activity */}
        <div className="lg:col-span-2 space-y-4">
          {/* Moderation actions */}
          <UserActions
            userId={user.id}
            currentStatus={user.status as 'active' | 'suspended' | 'banned'}
            currentRole={user.role}
            isSuperAdmin={isSuperAdmin}
          />

          {/* Recent posts */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-white font-semibold text-sm">Recent Posts</h2>
              <span className="text-zinc-600 text-xs">{user.recent_posts.length} shown · {user.post_count} total</span>
            </div>
            {user.recent_posts.length === 0 ? (
              <p className="text-center text-zinc-600 text-sm py-8">No posts yet</p>
            ) : (
              <ul>
                {user.recent_posts.map((p, i) => (
                  <li
                    key={p.id}
                    className={`px-5 py-4 space-y-2.5 ${i < user.recent_posts.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        {p.content && (
                          <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{p.content}</p>
                        )}
                        {p.images.length > 0 && (
                          <div className={`grid gap-1.5 ${
                            p.images.length === 1 ? 'grid-cols-1 max-w-xs' :
                            p.images.length === 2 ? 'grid-cols-2 max-w-xs' :
                            'grid-cols-3 max-w-sm'
                          }`}>
                            {p.images.slice(0, 4).map((path, idx) => (
                              <a
                                key={idx}
                                href={`${SUPABASE_URL}/storage/v1/object/public/posts/${path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative block aspect-square rounded-lg overflow-hidden bg-zinc-800 hover:opacity-90 transition-opacity"
                              >
                                <Image
                                  src={`${SUPABASE_URL}/storage/v1/object/public/posts/${path}`}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="120px"
                                />
                                {idx === 3 && p.images.length > 4 && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <span className="text-white text-sm font-semibold">+{p.images.length - 4}</span>
                                  </div>
                                )}
                              </a>
                            ))}
                          </div>
                        )}
                        {!p.content && p.images.length === 0 && (
                          <p className="text-zinc-500 text-sm italic">No content</p>
                        )}
                      </div>
                      <p className="text-zinc-500 text-xs whitespace-nowrap flex-shrink-0">{formatTimeAgo(p.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reports against this user */}
          {user.recent_reports.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-white font-semibold text-sm">Reports Against This User</h2>
                <span className="text-zinc-600 text-xs">{user.report_count} total</span>
              </div>
              <ul>
                {user.recent_reports.map((r, i) => (
                  <li
                    key={r.id}
                    className={`px-5 py-3 flex items-center gap-3 ${i < user.recent_reports.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                  >
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 flex-shrink-0">
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      r.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                      r.status === 'actioned' ? 'bg-red-500/20 text-red-300' :
                      'bg-zinc-700 text-zinc-400'
                    }`}>
                      {r.status}
                    </span>
                    {r.reporter_username && (
                      <p className="text-zinc-500 text-xs flex-1 min-w-0 truncate">
                        by @{r.reporter_username}
                      </p>
                    )}
                    <p className="text-zinc-600 text-xs flex-shrink-0">{formatTimeAgo(r.created_at)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
