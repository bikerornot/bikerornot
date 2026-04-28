'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { AdminUserProfileBundle } from '@/app/actions/admin'
import { computeRiskFlags } from '@/lib/risk'
import { getImageUrl } from '@/lib/supabase/image'
import UserActions from './UserActions'
import AvatarPreview from './AvatarPreview'
import GroupAdminPanel from './GroupAdminPanel'
import UserMessages from './UserMessages'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam', harassment: 'Harassment', hate_speech: 'Hate speech',
  nudity: 'Nudity', violence: 'Violence', fake_account: 'Fake account', other: 'Other',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Props {
  bundle: AdminUserProfileBundle
  /** Compact mode trims the "All users" back link + outer page padding,
      so the same view can render inline under a report card. */
  embedded?: boolean
}

export default function UserDetailView({ bundle, embedded = false }: Props) {
  const { user, createdGroups, onWatchlist, isSuperAdmin, friendshipStatus } = bundle
  const avatarUrl = user.profile_photo_url ? getImageUrl('avatars', user.profile_photo_url) : null
  const riskFlags = computeRiskFlags(user)

  return (
    <div className={embedded ? '' : 'p-6 max-w-4xl'}>
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/admin/users"
            className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            All users
          </Link>
          <Link
            href={`/admin/scammer/${user.id}`}
            className="flex items-center gap-1.5 text-orange-400 hover:text-orange-300 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Scammer Analysis
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: profile + moderation */}
        <div className="space-y-4">
          {/* Profile card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <AvatarPreview
                avatarUrl={avatarUrl}
                firstName={user.first_name}
                userId={user.id}
                storagePath={user.profile_photo_url}
                isReviewed={!!user.avatar_reviewed_at}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold">{user.first_name} {user.last_name}</p>
                <p className="text-zinc-400 text-sm">@{user.username ?? 'no username'}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {user.deactivated_at ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                      Deactivated
                    </span>
                  ) : (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      user.status === 'banned' ? 'bg-red-500/20 text-red-400' :
                      user.status === 'suspended' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {user.status}
                    </span>
                  )}
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
                <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Phone</dt>
                <dd className="text-zinc-300 flex items-center gap-2">
                  {user.phone_verified_at ? (
                    <>
                      <span className="font-mono text-xs">{user.phone_number}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        Verified {formatDate(user.phone_verified_at)}
                      </span>
                    </>
                  ) : user.phone_verification_required ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                      Pending — required
                    </span>
                  ) : (
                    <span className="text-zinc-600 text-xs">Not verified</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Joined</dt>
                <dd className="text-zinc-300">{formatDate(user.created_at)}</dd>
              </div>
              {user.date_of_birth && (
                <div>
                  <dt className="text-zinc-600 text-xs uppercase tracking-wider mb-0.5">Age</dt>
                  <dd className="text-zinc-300">{calculateAge(user.date_of_birth)} years old</dd>
                </div>
              )}
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

          {/* Web Detection (reverse image search) */}
          {user.avatar_web_detection && (
            <div className={`bg-zinc-900 border rounded-xl p-5 ${
              user.avatar_web_detection.isSuspicious ? 'border-red-500/40' : 'border-zinc-800'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Reverse Image Search</h3>
                {user.avatar_web_detection.isSuspicious ? (
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">SUSPICIOUS</span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">CLEAN</span>
                )}
              </div>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-zinc-600 text-xs mb-0.5">Matches Found</dt>
                  <dd className={`text-sm font-medium ${user.avatar_web_detection.matchCount >= 2 ? 'text-red-400' : 'text-zinc-300'}`}>
                    {user.avatar_web_detection.matchCount} page{user.avatar_web_detection.matchCount !== 1 ? 's' : ''}
                  </dd>
                </div>
                {user.avatar_web_detection.bestGuess && (
                  <div>
                    <dt className="text-zinc-600 text-xs mb-0.5">Best Guess</dt>
                    <dd className="text-zinc-300 text-sm">{user.avatar_web_detection.bestGuess}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-zinc-600 text-xs mb-0.5">Checked</dt>
                  <dd className="text-zinc-500 text-xs">{formatDate(user.avatar_web_detection.checkedAt)}</dd>
                </div>
              </dl>
              {user.avatar_web_detection.topMatches.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-zinc-600 text-xs font-medium">Found on:</p>
                  {user.avatar_web_detection.topMatches.map((match, i) => (
                    <a
                      key={i}
                      href={match.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-blue-400 hover:text-blue-300 truncate"
                      title={match.url}
                    >
                      {match.pageTitle || new URL(match.url).hostname}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* IP / Signup location */}
          <div className={`bg-zinc-900 border rounded-xl p-5 ${riskFlags.length > 0 ? 'border-red-500/40' : 'border-zinc-800'}`}>
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Signup Info</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">IP Address</dt>
                <dd className="text-zinc-300 font-mono text-xs">{user.signup_ip ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">Country</dt>
                <dd className={`text-sm font-medium ${riskFlags.length > 0 ? 'text-red-400' : 'text-zinc-300'}`}>
                  {user.signup_country ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">Region</dt>
                <dd className="text-zinc-300 text-sm">{user.signup_region ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">City (IP)</dt>
                <dd className="text-zinc-300 text-sm">{user.signup_city ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-600 text-xs mb-0.5">Referral Source</dt>
                <dd className="text-zinc-300 font-mono text-xs break-all">{user.signup_ref_url ?? '—'}</dd>
              </div>
            </dl>
            {riskFlags.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {riskFlags.map((flag, i) => (
                  <p key={i} className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    🚩 {flag}
                  </p>
                ))}
              </div>
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
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{user.post_count}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Posts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{user.message_count}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Messages</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{user.comment_count}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Comments</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{user.friend_count}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Friends</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{user.friend_requests_sent}</p>
                <p className="text-zinc-500 text-xs mt-0.5">FR Sent</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{user.friend_requests_received}</p>
                <p className="text-zinc-500 text-xs mt-0.5">FR Received</p>
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
          <UserActions
            userId={user.id}
            currentStatus={user.status as 'active' | 'suspended' | 'banned'}
            currentRole={user.role}
            isSuperAdmin={isSuperAdmin}
            friendshipStatus={friendshipStatus}
            initialOnWatchlist={onWatchlist}
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

          {/* Garage — bikes the user has added */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-white font-semibold text-sm">Garage</h2>
              <span className="text-zinc-600 text-xs">{user.bikes?.length ?? 0} bike{(user.bikes?.length ?? 0) !== 1 ? 's' : ''}</span>
            </div>
            {(user.bikes?.length ?? 0) === 0 ? (
              <p className="text-center text-zinc-600 text-sm py-8">No bikes</p>
            ) : (
              <ul>
                {user.bikes!.map((b, i) => {
                  const photoUrl = b.photo_url ? getImageUrl('bikes', b.photo_url) : null
                  const label = [b.year, b.make, b.model].filter(Boolean).join(' ') || 'Unknown bike'
                  return (
                    <li
                      key={b.id}
                      className={`px-5 py-3 flex items-start gap-3 ${i < user.bikes!.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                    >
                      <div className="w-16 h-16 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden relative">
                        {photoUrl ? (
                          <Image src={photoUrl} alt="" fill className="object-cover" sizes="64px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <circle cx="5.5" cy="17.5" r="3.5" />
                              <circle cx="18.5" cy="17.5" r="3.5" />
                              <path d="M15 6h3l2 5m-4-5l-4 11H5.5m0 0l2-7h7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={`/bikes/${b.id}`} className="text-white font-semibold text-sm hover:text-orange-400 transition-colors">
                          {label}
                        </Link>
                        <p className="text-zinc-500 text-xs mt-0.5">
                          {b.photo_count} photo{b.photo_count !== 1 ? 's' : ''} · added {formatTimeAgo(b.created_at)}
                        </p>
                        {b.description && (
                          <p className="text-zinc-400 text-xs mt-1 line-clamp-2 leading-relaxed">{b.description}</p>
                        )}
                      </div>
                    </li>
                  )
                })}
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

          <GroupAdminPanel groups={createdGroups} creatorId={user.id} />

          <UserMessages
            messages={user.recent_messages}
            messageCount={user.message_count}
            userId={user.id}
          />

          {/* Comments posted by this user */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-white font-semibold text-sm">Comments</h2>
              <span className="text-zinc-600 text-xs">{user.recent_comments.length} shown · {user.comment_count} total</span>
            </div>
            {user.recent_comments.length === 0 ? (
              <p className="text-center text-zinc-600 text-sm py-8">No comments yet</p>
            ) : (
              <ul>
                {user.recent_comments.map((c, i) => (
                  <li
                    key={c.id}
                    className={`px-5 py-3 space-y-1 ${i < user.recent_comments.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {c.post_author_username && (
                        <span className="text-xs text-orange-400 flex-shrink-0">on @{c.post_author_username}&apos;s post</span>
                      )}
                      <p className="text-zinc-600 text-xs flex-shrink-0 ml-auto">{formatTimeAgo(c.created_at)}</p>
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed">{c.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
