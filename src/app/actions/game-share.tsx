'use server'

import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { getMyGameStats, getLeaderboard } from './game'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ROUND_SIZE = 10

interface RoundItem {
  photoUrl: string
  isCorrect: boolean
}

async function renderShareCard(params: {
  items: RoundItem[]
  correctCount: number
  accuracyPercent: number
  totalPlayed: number
  rankLabel: string
}): Promise<ArrayBuffer> {
  const { items, correctCount, accuracyPercent, totalPlayed, rankLabel } = params

  const row1 = items.slice(0, 5)
  const row2 = items.slice(5, 10)

  const img = new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, #09090b 0%, #18181b 55%, #000000 100%)',
          padding: '50px 70px',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              letterSpacing: '0.3em',
              color: '#a1a1aa',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            What's That Bike?
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 44,
              fontWeight: 900,
              color: '#fb923c',
              letterSpacing: '-0.02em',
            }}
          >
            {correctCount} OF {ROUND_SIZE} RIGHT
          </div>
        </div>

        {/* Thumbnail grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          {[row1, row2].map((row, rowIdx) => (
            <div key={rowIdx} style={{ display: 'flex', gap: 14 }}>
              {row.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    width: 172,
                    height: 172,
                    borderRadius: 14,
                    border: `7px solid ${item.isCorrect ? '#22c55e' : '#ef4444'}`,
                    overflow: 'hidden',
                    backgroundColor: '#18181b',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.photoUrl}
                    alt=""
                    width={158}
                    height={158}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Stats footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            borderTop: '1px solid #3f3f46',
            paddingTop: 24,
            fontSize: 44,
            color: '#a1a1aa',
            letterSpacing: '0.03em',
          }}
        >
          <span style={{ color: '#e4e4e7', fontWeight: 700 }}>{accuracyPercent}%</span>
          <span>&nbsp;accuracy&nbsp;·&nbsp;</span>
          <span style={{ color: '#e4e4e7', fontWeight: 700 }}>{totalPlayed}</span>
          <span>&nbsp;total&nbsp;·&nbsp;Rank&nbsp;</span>
          <span style={{ color: '#e4e4e7', fontWeight: 700 }}>{rankLabel}</span>
        </div>
      </div>
    ),
    { width: 1080, height: 810 }
  )

  return img.arrayBuffer()
}

export async function shareGameResult(): Promise<{ postId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`shareGameResult:${user.id}`, 3, 300_000)

  const admin = getServiceClient()

  // One share per day
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { data: recentShare } = await admin
    .from('posts')
    .select('id')
    .eq('author_id', user.id)
    .eq('post_type', 'game_share')
    .is('deleted_at', null)
    .gte('created_at', oneDayAgo)
    .limit(1)
    .maybeSingle()
  if (recentShare) {
    return { error: 'You already shared your stats today. Try again tomorrow.' }
  }

  const [{ data: profile }, stats, leaderboard, { data: recentAnswers }] = await Promise.all([
    admin.from('profiles').select('username').eq('id', user.id).single(),
    getMyGameStats(),
    getLeaderboard(500),
    admin
      .from('game_answers')
      .select('is_correct, created_at, bike_photo:bike_photos!bike_photo_id(storage_path)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(ROUND_SIZE),
  ])

  if (!profile?.username) return { error: 'Profile not found' }
  if (!recentAnswers || recentAnswers.length < ROUND_SIZE) {
    return { error: `Play at least ${ROUND_SIZE} rounds before sharing your stats.` }
  }

  // Newest first from DB — flip to chronological so the card reads left-to-right in play order
  const ordered = [...recentAnswers].reverse()
  const items: RoundItem[] = ordered.map((a: any) => {
    const path = a.bike_photo?.storage_path as string | undefined
    return {
      photoUrl: path ? `${SUPABASE_URL}/storage/v1/object/public/bikes/${path}` : '',
      isCorrect: !!a.is_correct,
    }
  })

  const correctCount = items.filter((i) => i.isCorrect).length

  const sortedByAccuracy = [...leaderboard].sort((a, b) => b.accuracyPercent - a.accuracyPercent)
  const rankIndex = sortedByAccuracy.findIndex((e) => e.userId === user.id)
  const rank = rankIndex >= 0 ? rankIndex + 1 : null
  const rankLabel = rank !== null ? `#${rank}` : '—'

  const png = await renderShareCard({
    items,
    correctCount,
    accuracyPercent: stats.accuracyPercent,
    totalPlayed: stats.totalPlayed,
    rankLabel,
  })

  const caption = "What's That Bike? — here's where I'm at"

  const { data: post, error: postError } = await admin
    .from('posts')
    .insert({
      author_id: user.id,
      content: caption,
      post_type: 'game_share',
    })
    .select()
    .single()
  if (postError) throw new Error(postError.message)

  const path = `${user.id}/${post.id}/game-share.png`
  const { error: uploadError } = await admin.storage
    .from('posts')
    .upload(path, png, { contentType: 'image/png' })
  if (uploadError) {
    await admin.from('posts').delete().eq('id', post.id)
    throw new Error(uploadError.message)
  }

  const { error: imgError } = await admin.from('post_images').insert({
    post_id: post.id,
    storage_path: path,
    order_index: 0,
    reviewed_at: new Date().toISOString(),
  })
  if (imgError) {
    await admin.from('posts').delete().eq('id', post.id)
    throw new Error(imgError.message)
  }

  return { postId: post.id }
}
