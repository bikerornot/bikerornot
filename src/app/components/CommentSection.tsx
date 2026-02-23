'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Comment, Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import CommentItem from './CommentItem'
import { createComment } from '@/app/actions/comments'

interface Props {
  postId: string
  currentUserId?: string
  currentUserProfile?: Profile | null
}

export default function CommentSection({ postId, currentUserId, currentUserProfile }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase
      .from('comments')
      .select('*, author:profiles(*)')
      .eq('post_id', postId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setComments(data as Comment[])
        setLoading(false)
      })

    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('comments')
            .select('*, author:profiles(*)')
            .eq('id', payload.new.id)
            .single()
          if (data) {
            setComments((prev) =>
              prev.some((c) => c.id === data.id) ? prev : [...prev, data as Comment]
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [postId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || !currentUserId) return

    setSubmitting(true)
    try {
      await createComment(postId, trimmed)
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  const avatarUrl = currentUserProfile?.profile_photo_url
    ? getImageUrl('avatars', currentUserProfile.profile_photo_url)
    : null
  const displayName = currentUserProfile?.username ?? 'Unknown'

  return (
    <div>
      {loading && <p className="text-zinc-500 text-sm py-2">Loading…</p>}

      {!loading && comments.length === 0 && (
        <p className="text-zinc-500 text-sm py-2">No comments yet.</p>
      )}

      {comments.map((c) => (
        <CommentItem key={c.id} comment={c} currentUserId={currentUserId} />
      ))}

      {currentUserId && (
        <form
          onSubmit={handleSubmit}
          className="flex gap-3 mt-3 pt-3 border-t border-zinc-800"
        >
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={32}
                  height={32}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
                  {(currentUserProfile?.first_name?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a comment…"
              disabled={submitting}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="text-orange-400 hover:text-orange-300 disabled:opacity-40 text-sm font-semibold transition-colors"
            >
              Post
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
