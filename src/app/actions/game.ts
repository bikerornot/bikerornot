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

  const { data } = await admin.rpc('get_unreviewed_harley_photos' as any, { p_limit: limit })

  if (!data || !Array.isArray(data)) return []

  return (data as any[]).map((p) => ({
    id: p.id,
    storage_path: p.storage_path,
    bike_id: p.bike_id,
    year: p.year ?? null,
    make: p.make ?? null,
    model: p.model ?? null,
    username: p.username ?? null,
  }))
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

export async function getApprovedGamePhotos(page = 1, pageSize = 40): Promise<{ photos: GamePhoto[]; total: number }> {
  await requireAdmin()
  const admin = getServiceClient()

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count } = await admin
    .from('bike_photos')
    .select('id, storage_path, bike_id, bike:user_bikes!bike_id(year, make, model, user_id), user:user_bikes!bike_id(user:profiles!user_id(username))', { count: 'exact' })
    .eq('game_approved', true)
    .order('game_reviewed_at', { ascending: false })
    .range(from, to)

  const photos: GamePhoto[] = ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    storage_path: p.storage_path,
    bike_id: p.bike_id,
    year: p.bike?.year ?? null,
    make: p.bike?.make ?? null,
    model: p.bike?.model ?? null,
    username: p.user?.user?.username ?? null,
  }))

  return { photos, total: count ?? 0 }
}

export async function unapproveGamePhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await requireAdmin()
  const admin = getServiceClient()

  await admin
    .from('bike_photos')
    .update({ game_approved: false, game_reviewed_at: new Date().toISOString() })
    .in('id', ids)
}

// ─── Game Engine Types ─────────────────────────────────────

export interface GameRound {
  photoId: string
  storagePath: string
  // Extra photos of the same bike — may include non-approved photos. Shown as
  // context via arrows / swipe after the main photo. photoId + storagePath
  // remain the canonical quiz image (photos[0]).
  photos: { storagePath: string }[]
  options: string[]       // 4 options like "2019 Street Glide"
  correctIndex: number    // which option is correct (0-3)
}

export type LeaderboardWindow = 'week' | 'all'

export interface GameStats {
  totalPlayed: number             // within the active window
  correctAnswers: number          // within the active window
  accuracyPercent: number
  currentStreak: number           // always all-time (streaks don't segment well)
  bestStreak: number              // always all-time
  rank: number | null             // null when player is below the min-games threshold
  totalRanked: number             // total qualified players in this window
  gamesNeededToRank: number       // 0 when already qualified
  window: LeaderboardWindow
  minGamesToRank: number
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
    .select('id, storage_path, bike_id, bike:user_bikes!bike_id(year, model)')
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

  // Pull every photo of this bike so the UI can offer alternate-angle context
  // via arrows/swipe. Non-approved photos are OK here — they're not the quiz
  // image, just supporting views. Main photo stays at photos[0].
  const { data: bikePhotos } = await admin
    .from('bike_photos')
    .select('id, storage_path, is_primary, created_at')
    .eq('bike_id', pick.bike_id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })

  const extras = (bikePhotos ?? [])
    .filter((p) => p.id !== pick.id)
    .map((p) => ({ storagePath: p.storage_path }))
  const photos = [{ storagePath: pick.storage_path }, ...extras]

  return {
    photoId: pick.id,
    storagePath: pick.storage_path,
    photos,
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MIN_GAMES: Record<LeaderboardWindow, number> = { week: 20, all: 10 }

function windowCutoffIso(window: LeaderboardWindow): string | null {
  return window === 'week' ? new Date(Date.now() - WEEK_MS).toISOString() : null
}

// Paginated fetch of one user's answers, optionally bounded to a recent window.
async function fetchUserAnswers(
  userId: string,
  cutoff: string | null
): Promise<{ is_correct: boolean; created_at: string }[]> {
  const admin = getServiceClient()
  const answers: { is_correct: boolean; created_at: string }[] = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    let q = admin
      .from('game_answers')
      .select('is_correct, created_at')
      .eq('user_id', userId)
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (cutoff) q = q.gte('created_at', cutoff)
    const { data: chunk } = await q
    if (!chunk || chunk.length === 0) break
    answers.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    page++
  }
  return answers
}

// Paginated fetch of every player's answers, optionally bounded to a window.
async function fetchAllAnswers(
  cutoff: string | null
): Promise<{ user_id: string; is_correct: boolean }[]> {
  const admin = getServiceClient()
  const all: { user_id: string; is_correct: boolean }[] = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    let q = admin
      .from('game_answers')
      .select('user_id, is_correct')
      .is('voided_at', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (cutoff) q = q.gte('created_at', cutoff)
    const { data: chunk } = await q
    if (!chunk || chunk.length === 0) break
    all.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    page++
  }
  return all
}

function aggregateByUser(
  answers: { user_id: string; is_correct: boolean }[]
): Record<string, { correct: number; total: number }> {
  const stats: Record<string, { correct: number; total: number }> = {}
  for (const a of answers) {
    if (!stats[a.user_id]) stats[a.user_id] = { correct: 0, total: 0 }
    stats[a.user_id].total++
    if (a.is_correct) stats[a.user_id].correct++
  }
  return stats
}

export async function getMyGameStats(window: LeaderboardWindow = 'all'): Promise<GameStats> {
  const user = await requireAuth()
  const cutoff = windowCutoffIso(window)
  const minGamesToRank = MIN_GAMES[window]

  // Streaks always all-time — partial-window streaks are confusing.
  const [windowAnswers, allTimeAnswers] = await Promise.all([
    fetchUserAnswers(user.id, cutoff),
    cutoff ? fetchUserAnswers(user.id, null) : Promise.resolve(null),
  ])

  const streakSource = allTimeAnswers ?? windowAnswers
  let currentStreak = 0
  for (const a of streakSource) {
    if (a.is_correct) currentStreak++
    else break
  }
  let bestStreak = 0
  let streak = 0
  for (const a of [...streakSource].reverse()) {
    if (a.is_correct) {
      streak++
      if (streak > bestStreak) bestStreak = streak
    } else {
      streak = 0
    }
  }

  const totalPlayed = windowAnswers.length
  const correctAnswers = windowAnswers.filter((a) => a.is_correct).length
  const accuracyPercent = totalPlayed > 0 ? Math.round((correctAnswers / totalPlayed) * 100) : 0

  const { rank, totalRanked } = await computeRankFor(user.id, totalPlayed, correctAnswers, window)
  const gamesNeededToRank = Math.max(0, minGamesToRank - totalPlayed)

  return {
    totalPlayed, correctAnswers, accuracyPercent,
    currentStreak, bestStreak,
    rank, totalRanked, gamesNeededToRank,
    window, minGamesToRank,
  }
}

async function computeRankFor(
  userId: string,
  userTotal: number,
  userCorrect: number,
  window: LeaderboardWindow
): Promise<{ rank: number | null; totalRanked: number }> {
  const stats = aggregateByUser(await fetchAllAnswers(windowCutoffIso(window)))
  const minGames = MIN_GAMES[window]

  const qualified = Object.entries(stats).filter(([, s]) => s.total >= minGames)
  const totalRanked = qualified.length

  if (userTotal < minGames) return { rank: null, totalRanked }

  const userAccuracy = userCorrect / userTotal
  const ahead = qualified.filter(([otherId, s]) => {
    if (otherId === userId) return false
    const otherAccuracy = s.correct / s.total
    if (otherAccuracy > userAccuracy) return true
    if (otherAccuracy === userAccuracy && s.correct > userCorrect) return true
    return false
  }).length

  return { rank: ahead + 1, totalRanked }
}

export async function getLeaderboard(
  limit = 20,
  window: LeaderboardWindow = 'all'
): Promise<LeaderboardEntry[]> {
  await requireAuth()
  const admin = getServiceClient()
  const minGames = MIN_GAMES[window]

  const answers = await fetchAllAnswers(windowCutoffIso(window))
  if (answers.length === 0) return []
  const stats = aggregateByUser(answers)

  const ranked = Object.entries(stats)
    .map(([userId, s]) => ({ userId, ...s }))
    .filter((s) => s.total >= minGames)
    .sort((a, b) => {
      const accA = a.total > 0 ? a.correct / a.total : 0
      const accB = b.total > 0 ? b.correct / b.total : 0
      return accB - accA || b.correct - a.correct
    })
    .slice(0, limit)

  if (ranked.length === 0) return []

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
