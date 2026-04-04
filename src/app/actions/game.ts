'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Not authorized')
  }
  return user
}

// ─── Photo Review Types ────────────────────────────────────

export interface GamePhoto {
  id: string
  storage_path: string
  bike_id: string
  year: number | null
  make: string | null
  model: string | null
  username: string | null
}

export interface GamePhotoStats {
  total: number
  approved: number
  rejected: number
  remaining: number
}

// ─── Photo Review Actions ──────────────────────────────────

export async function getUnreviewedGamePhotos(limit = 20): Promise<GamePhoto[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin
    .from('bike_photos')
    .select('id, storage_path, bike_id, bike:user_bikes!bike_id(year, make, model, user_id), owner:user_bikes!bike_id(user:profiles!user_id(username))')
    .is('game_approved', null)
    .order('created_at', { ascending: true })
    .limit(200)

  if (!data) return []

  // Filter to Harley-Davidson only (client-side since we can't filter on joined table easily)
  const harleys = (data as any[])
    .filter((p) => p.bike?.make === 'Harley-Davidson')
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      storage_path: p.storage_path,
      bike_id: p.bike_id,
      year: p.bike?.year ?? null,
      make: p.bike?.make ?? null,
      model: p.bike?.model ?? null,
      username: p.owner?.user?.username ?? null,
    }))

  return harleys
}

export async function submitGamePhotoReviews(
  approved: string[],
  rejected: string[]
): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  const now = new Date().toISOString()

  if (approved.length > 0) {
    await admin
      .from('bike_photos')
      .update({ game_approved: true, game_reviewed_at: now })
      .in('id', approved)
  }

  if (rejected.length > 0) {
    await admin
      .from('bike_photos')
      .update({ game_approved: false, game_reviewed_at: now })
      .in('id', rejected)
  }
}

export async function getGamePhotoStats(): Promise<GamePhotoStats> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin.rpc('get_game_photo_stats' as any)

  if (!data || !Array.isArray(data) || data.length === 0) {
    // Fallback: direct counts via individual queries with a smaller approach
    const { data: counts } = await admin
      .from('bike_photos')
      .select('game_approved, bike:user_bikes!bike_id(make)')

    const harleys = ((counts ?? []) as any[]).filter((c) => c.bike?.make === 'Harley-Davidson')
    const total = harleys.length
    const approved = harleys.filter((c) => c.game_approved === true).length
    const rejected = harleys.filter((c) => c.game_approved === false).length

    return { total, approved, rejected, remaining: total - approved - rejected }
  }

  const row = data[0]
  return {
    total: row.total ?? 0,
    approved: row.approved ?? 0,
    rejected: row.rejected ?? 0,
    remaining: row.remaining ?? 0,
  }
}

// ─── Game Engine Types ─────────────────────────────────────

export interface GameRound {
  photoId: string
  storagePath: string
  options: string[]       // 4 options like "2019 Street Glide"
  correctIndex: number    // which option is correct (0-3)
}

export interface GameStats {
  totalPlayed: number
  correctAnswers: number
  accuracyPercent: number
  currentStreak: number
  bestStreak: number
}

export interface LeaderboardEntry {
  userId: string
  username: string | null
  profilePhotoUrl: string | null
  correctCount: number
  totalGames: number
  accuracyPercent: number
}

// ─── Game Engine Actions ───────────────────────────────────

export async function getGameRound(): Promise<GameRound | null> {
  const user = await requireAuth()
  const admin = getServiceClient()

  // Get IDs of photos this user answered in the last 24 hours (avoid repeats)
  const { data: recentAnswers } = await admin
    .from('game_answers')
    .select('bike_photo_id')
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const recentPhotoIds = new Set((recentAnswers ?? []).map((a) => a.bike_photo_id))

  // Get all approved photos with bike info
  const { data: approvedPhotos } = await admin
    .from('bike_photos')
    .select('id, storage_path, bike:user_bikes!bike_id(year, model)')
    .eq('game_approved', true)

  if (!approvedPhotos || approvedPhotos.length === 0) return null

  // Filter out recently answered and those missing year/model
  const eligible = (approvedPhotos as any[]).filter(
    (p) => !recentPhotoIds.has(p.id) && p.bike?.year && p.bike?.model
  )

  if (eligible.length === 0) return null

  // Pick a random photo
  const pick = eligible[Math.floor(Math.random() * eligible.length)]
  const correctYear = pick.bike.year as number
  const correctModel = pick.bike.model as string
  const correctAnswer = `${correctYear} ${correctModel}`

  // Generate 3 wrong answers from real Harley models
  const { data: allModels } = await admin
    .from('user_bikes')
    .select('year, model')
    .eq('make', 'Harley-Davidson')
    .not('model', 'is', null)
    .not('year', 'is', null)
    .gte('year', correctYear - 5)
    .lte('year', correctYear + 5)

  // Build pool of unique "year model" combos that differ from the correct answer
  const wrongPool = new Map<string, string>()
  for (const m of allModels ?? []) {
    const label = `${m.year} ${m.model}`
    if (label !== correctAnswer && !wrongPool.has(label)) {
      wrongPool.set(label, label)
    }
  }

  let wrongAnswers = Array.from(wrongPool.values())

  // If not enough variety from nearby years, pull from any year
  if (wrongAnswers.length < 3) {
    const { data: fallbackModels } = await admin
      .from('user_bikes')
      .select('year, model')
      .eq('make', 'Harley-Davidson')
      .not('model', 'is', null)
      .not('year', 'is', null)
      .limit(200)

    for (const m of fallbackModels ?? []) {
      const label = `${m.year} ${m.model}`
      if (label !== correctAnswer && !wrongPool.has(label)) {
        wrongPool.set(label, label)
      }
    }
    wrongAnswers = Array.from(wrongPool.values())
  }

  // Shuffle and pick 3
  for (let i = wrongAnswers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[wrongAnswers[i], wrongAnswers[j]] = [wrongAnswers[j], wrongAnswers[i]]
  }
  const selected = wrongAnswers.slice(0, 3)

  // Combine correct + wrong, shuffle, track correct index
  const options = [correctAnswer, ...selected]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }

  return {
    photoId: pick.id,
    storagePath: pick.storage_path,
    options,
    correctIndex: options.indexOf(correctAnswer),
  }
}

export async function submitGameAnswer(
  photoId: string,
  selectedAnswer: string,
  isCorrect: boolean,
  timeTakenMs: number
): Promise<void> {
  const user = await requireAuth()
  const admin = getServiceClient()

  // Get the correct year/model for this photo
  const { data: photo } = await admin
    .from('bike_photos')
    .select('bike:user_bikes!bike_id(year, model)')
    .eq('id', photoId)
    .single()

  const correctYear = (photo as any)?.bike?.year ?? 0
  const correctModel = (photo as any)?.bike?.model ?? ''

  await admin.from('game_answers').insert({
    user_id: user.id,
    bike_photo_id: photoId,
    correct_year: correctYear,
    correct_model: correctModel,
    selected_answer: selectedAnswer,
    is_correct: isCorrect,
    time_taken_ms: timeTakenMs,
  })
}

export async function getMyGameStats(): Promise<GameStats> {
  const user = await requireAuth()
  const admin = getServiceClient()

  const { data: answers } = await admin
    .from('game_answers')
    .select('is_correct, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (!answers || answers.length === 0) {
    return { totalPlayed: 0, correctAnswers: 0, accuracyPercent: 0, currentStreak: 0, bestStreak: 0 }
  }

  const totalPlayed = answers.length
  const correctAnswers = answers.filter((a) => a.is_correct).length
  const accuracyPercent = Math.round((correctAnswers / totalPlayed) * 100)

  // Calculate streaks (answers are sorted newest first)
  let currentStreak = 0
  for (const a of answers) {
    if (a.is_correct) currentStreak++
    else break
  }

  let bestStreak = 0
  let streak = 0
  // Reverse to go oldest first for best streak calculation
  for (const a of [...answers].reverse()) {
    if (a.is_correct) {
      streak++
      if (streak > bestStreak) bestStreak = streak
    } else {
      streak = 0
    }
  }

  return { totalPlayed, correctAnswers, accuracyPercent, currentStreak, bestStreak }
}

export async function getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  await requireAuth()
  const admin = getServiceClient()

  const { data: fullData } = await admin
    .from('game_answers')
    .select('user_id, is_correct')

  if (!fullData || fullData.length === 0) return []

  const stats: Record<string, { correct: number; total: number }> = {}
  for (const a of fullData) {
    if (!stats[a.user_id]) stats[a.user_id] = { correct: 0, total: 0 }
    stats[a.user_id].total++
    if (a.is_correct) stats[a.user_id].correct++
  }

  // Filter to 10+ games, sort by accuracy
  const ranked = Object.entries(stats)
    .map(([userId, s]) => ({ userId, ...s }))
    .filter((s) => s.total >= 1)
    .sort((a, b) => {
      const accA = a.total > 0 ? a.correct / a.total : 0
      const accB = b.total > 0 ? b.correct / b.total : 0
      return accB - accA || b.correct - a.correct
    })
    .slice(0, limit)

  if (ranked.length === 0) return []

  // Fetch profiles
  const userIds = ranked.map((r) => r.userId)
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, profile_photo_url')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return ranked.map((r) => {
    const profile = profileMap.get(r.userId)
    return {
      userId: r.userId,
      username: profile?.username ?? null,
      profilePhotoUrl: profile?.profile_photo_url ?? null,
      correctCount: r.correct,
      totalGames: r.total,
      accuracyPercent: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
    }
  })
}
