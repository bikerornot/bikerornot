'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createPost } from '@/app/actions/posts'
import { sendFriendRequest } from '@/app/actions/friends'
import { getImageUrl } from '@/lib/supabase/image'
import type { RiderSuggestion } from '@/app/actions/suggestions'

interface Props {
  firstName: string
  city: string | null
  state: string | null
  bikeString: string | null
  riders: RiderSuggestion[]
  currentUserId: string
}

export default function WelcomeClient({ firstName, city, state, bikeString, riders, currentUserId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<'post' | 'friends'>('post')
  const [postContent, setPostContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [sendingAll, setSendingAll] = useState(false)
  const submittingRef = useRef(false)

  const location = [city, state].filter(Boolean).join(', ')
  const displayRiders = riders.slice(0, 10)

  const templates = [
    bikeString
      ? `Hey everyone! I'm ${firstName} from ${location || 'around'}. I ride a ${bikeString}. Looking forward to connecting with fellow riders!`
      : `Hey everyone! I'm ${firstName} from ${location || 'around'}. Just joined BikerOrNot and looking forward to meeting fellow riders!`,
    `New here! Been riding for years and finally found a community. Let's ride!`,
    location
      ? `Just joined BikerOrNot! Any riders near ${location}? Let's connect!`
      : `Just joined BikerOrNot! Looking to connect with riders. Let's ride!`,
  ]

  async function handlePost() {
    if (posting || !postContent.trim() || submittingRef.current) return
    submittingRef.current = true
    setPosting(true)
    try {
      const formData = new FormData()
      formData.append('content', postContent.trim())
      await createPost(formData)
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

  async function handleSendAll() {
    setSendingAll(true)
    const toSend = displayRiders.filter((r) => !sentIds.has(r.id))
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
                  Here are some riders near you. Send them a friend request to get started!
                </p>

                {displayRiders.length > 1 && (
                  <button
                    onClick={handleSendAll}
                    disabled={sendingAll || sentIds.size === displayRiders.length}
                    className="w-full bg-orange-500/10 border border-orange-500/30 text-orange-400 font-semibold py-2.5 rounded-xl transition-colors text-sm hover:bg-orange-500/20 disabled:opacity-40"
                  >
                    {sendingAll ? 'Sending...' : sentIds.size === displayRiders.length ? 'All Sent!' : `Send to All ${displayRiders.length} Riders`}
                  </button>
                )}

                <div className="space-y-2">
                  {displayRiders.map((rider) => {
                    const sent = sentIds.has(rider.id)
                    const avatarUrl = rider.profile_photo_url
                      ? getImageUrl('avatars', rider.profile_photo_url)
                      : null
                    const loc = [rider.city, rider.state].filter(Boolean).join(', ')

                    return (
                      <div
                        key={rider.id}
                        className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
                      >
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
                        <button
                          onClick={() => handleSendRequest(rider.id)}
                          disabled={sent}
                          className={`flex-shrink-0 text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors ${
                            sent
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-orange-500 hover:bg-orange-600 text-white'
                          }`}
                        >
                          {sent ? 'Sent' : 'Add'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="text-zinc-400 text-sm text-center py-8">
                We're still finding riders near you. Check back soon!
              </p>
            )}

            <button
              onClick={goToFeed}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-colors text-base mt-4"
            >
              {sentIds.size > 0 ? 'Go to My Feed' : 'Skip & Go to Feed'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
