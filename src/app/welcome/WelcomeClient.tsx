'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createWelcomePost } from '@/app/actions/posts'
import { sendFriendRequest } from '@/app/actions/friends'
import { getImageUrl } from '@/lib/supabase/image'
import type { RiderSuggestion } from '@/app/actions/suggestions'

interface Props {
  firstName: string
  city: string | null
  state: string | null
  bikeString: string | null
  bikePhotoPath: string | null
  riders: RiderSuggestion[]
  currentUserId: string
  templates: string[]
}

export default function WelcomeClient({ firstName, city, state, bikeString, bikePhotoPath, riders, currentUserId, templates }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<'post' | 'friends'>('post')
  const [postContent, setPostContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(riders.slice(0, 10).map((r) => r.id)))
  const [sendingAll, setSendingAll] = useState(false)
  const submittingRef = useRef(false)

  const displayRiders = riders.slice(0, 10)

  async function handlePost() {
    if (posting || !postContent.trim() || submittingRef.current) return
    submittingRef.current = true
    setPosting(true)
    try {
      await createWelcomePost(postContent.trim(), bikePhotoPath)
      setStep('friends')
    } catch {
      // Silently continue to friends step even if post fails
      setStep('friends')
    } finally {
      setPosting(false)
      submittingRef.current = false
    }
  }

  async function handleSendRequest(riderId: string) {
    if (sentIds.has(riderId)) return
    setSentIds((prev) => new Set(prev).add(riderId))
    try {
      await sendFriendRequest(riderId)
    } catch {
      // Silently ignore — rate limit or other issue
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSendSelected() {
    setSendingAll(true)
    const toSend = displayRiders.filter((r) => selectedIds.has(r.id) && !sentIds.has(r.id))
    const newSent = new Set(sentIds)
    for (const r of toSend) {
      newSent.add(r.id)
      try {
        await sendFriendRequest(r.id)
      } catch {
        break // Hit rate limit, stop
      }
    }
    setSentIds(newSent)
    setSendingAll(false)
    // Auto-navigate to feed after sending
    router.push('/feed')
  }

  function goToFeed() {
    router.push('/feed')
  }

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-4 text-center">
        <h1 className="text-xl font-bold text-white">
          Welcome to BikerOrNot, {firstName}!
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {step === 'post' ? 'Introduce yourself to the community' : 'Connect with riders near you'}
        </p>
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mt-3">
          <div className={`w-2 h-2 rounded-full ${step === 'post' ? 'bg-orange-500' : 'bg-emerald-500'}`} />
          <div className={`w-2 h-2 rounded-full ${step === 'friends' ? 'bg-orange-500' : 'bg-zinc-700'}`} />
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        {step === 'post' && (
          <div className="space-y-4">
            <p className="text-zinc-300 text-base">
              Your first post helps other riders get to know you. Pick a template or write your own:
            </p>

            {/* Templates */}
            <div className="space-y-2">
              {templates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setPostContent(t)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors text-sm ${
                    postContent === t
                      ? 'bg-orange-500/10 border-orange-500/40 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Editable composer */}
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="Or write your own introduction..."
              rows={4}
              maxLength={5000}
              className="w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-orange-500 transition-colors resize-none"
            />

            {/* Bike photo preview */}
            {bikePhotoPath && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <p className="text-zinc-400 text-sm mb-2">Your bike photo will be included:</p>
                <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden bg-zinc-800">
                  <Image
                    src={getImageUrl('bikes', bikePhotoPath)}
                    alt="Your bike"
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handlePost}
              disabled={posting || !postContent.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-xl transition-colors text-base"
            >
              {posting ? 'Posting...' : 'Post & Continue'}
            </button>

            <button
              onClick={() => setStep('friends')}
              className="w-full text-zinc-500 hover:text-zinc-300 text-sm py-2 transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        {step === 'friends' && (
          <div className="space-y-4">
            {displayRiders.length > 0 ? (
              <>
                <p className="text-zinc-300 text-base">
                  We found riders near you! They're all selected — just hit the button below to connect.
                </p>

                {/* Social proof nudge */}
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
                  <p className="text-orange-400 text-sm font-medium">
                    Members who connect with 3+ riders are 5x more likely to enjoy BikerOrNot
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (selectedIds.size === displayRiders.length) {
                        setSelectedIds(new Set())
                      } else {
                        setSelectedIds(new Set(displayRiders.map((r) => r.id)))
                      }
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {selectedIds.size === displayRiders.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                <div className="space-y-2">
                  {displayRiders.map((rider) => {
                    const sent = sentIds.has(rider.id)
                    const selected = selectedIds.has(rider.id)
                    const avatarUrl = rider.profile_photo_url
                      ? getImageUrl('avatars', rider.profile_photo_url)
                      : null
                    const loc = [rider.city, rider.state].filter(Boolean).join(', ')

                    return (
                      <button
                        key={rider.id}
                        onClick={() => !sent && toggleSelected(rider.id)}
                        disabled={sent}
                        className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-colors text-left ${
                          sent
                            ? 'bg-emerald-500/5 border border-emerald-500/20'
                            : selected
                            ? 'bg-orange-500/10 border border-orange-500/30'
                            : 'bg-zinc-900 border border-zinc-800'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                          sent ? 'bg-emerald-500 border-emerald-500' : selected ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'
                        }`}>
                          {(sent || selected) && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                          {avatarUrl ? (
                            <Image src={avatarUrl} alt="" width={40} height={40} className="object-cover w-full h-full" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
                              {(rider.username?.[0] ?? '?').toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">@{rider.username}</p>
                          {loc && <p className="text-zinc-500 text-sm truncate">{loc}</p>}
                          {rider.bike && <p className="text-orange-400/80 text-sm truncate">{rider.bike}</p>}
                          {rider.mutual_friend_count > 0 && (
                            <p className="text-zinc-500 text-sm">{rider.mutual_friend_count} mutual</p>
                          )}
                        </div>
                        {sent && <span className="text-emerald-400 text-sm font-medium flex-shrink-0">Sent</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Primary CTA — send selected and go to feed */}
                <button
                  onClick={handleSendSelected}
                  disabled={sendingAll}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors text-base"
                >
                  {sendingAll ? 'Sending requests...' : `Connect with ${selectedIds.size} Rider${selectedIds.size !== 1 ? 's' : ''} & Go to Feed`}
                </button>

                {/* De-emphasized skip */}
                <button
                  onClick={goToFeed}
                  className="w-full text-zinc-600 hover:text-zinc-400 text-xs py-1 transition-colors"
                >
                  skip
                </button>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-zinc-400 text-sm">We're still finding riders near you.</p>
                <button
                  onClick={goToFeed}
                  className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-8 rounded-xl transition-colors text-base"
                >
                  Go to Feed
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
