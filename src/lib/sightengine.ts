import 'server-only'

/**
 * Sightengine AI image moderation
 *
 * Required env vars:
 *   SIGHTENGINE_API_USER
 *   SIGHTENGINE_API_SECRET
 *
 * Returns:
 *   'approved'  — image is clean, skip the human review queue
 *   'pending'   — borderline or API unavailable, goes to human review queue
 *   'rejected'  — clear violation, do not store the image
 */

export type ModerationResult = 'approved' | 'pending' | 'rejected'

export interface ModerationDetails {
  verdict: ModerationResult
  reason: string | null
  scores: {
    nudity_raw: number
    nudity_partial: number
    nudity_sexual: number
    nudity_explicit: number
    gore: number
    weapon: number
    illustration: number
  } | null
}

// Backwards-compatible verdict-only path. Most call sites that don't need
// the scores can keep using this.
export async function moderateImage(
  bytes: ArrayBuffer,
  contentType: string
): Promise<ModerationResult> {
  const { verdict } = await moderateImageDetailed(bytes, contentType)
  return verdict
}

// Verdict + raw scores + which rule fired. New rejection-logging path uses
// this so the admin queue can show why each image was blocked.
export async function moderateImageDetailed(
  bytes: ArrayBuffer,
  contentType: string
): Promise<ModerationDetails> {
  const apiUser = process.env.SIGHTENGINE_API_USER
  const apiSecret = process.env.SIGHTENGINE_API_SECRET

  // Not configured — fall through to human review
  if (!apiUser || !apiSecret) return { verdict: 'pending', reason: 'sightengine_unconfigured', scores: null }

  const form = new FormData()
  form.append('media', new Blob([bytes], { type: contentType }), 'image')
  form.append('models', 'nudity,gore,weapon,type')
  form.append('api_user', apiUser)
  form.append('api_secret', apiSecret)

  let data: any
  try {
    const res = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: form,
    })
    data = await res.json()
  } catch {
    // Network / parse error — fail open, send to human review
    return { verdict: 'pending', reason: 'sightengine_unreachable', scores: null }
  }

  if (data.status !== 'success') return { verdict: 'pending', reason: 'sightengine_non_success', scores: null }

  const nudityRaw = data.nudity?.raw ?? 0
  const nudityPartial = data.nudity?.partial ?? 0
  const nuditySexual = data.nudity?.sexual_activity ?? 0
  const nudityExplicit = data.nudity?.erotica ?? 0
  const gore = data.gore?.prob ?? 0
  const weapon = data.weapon?.prob ?? 0
  const illustration = data.type?.illustration ?? 0
  const isIllustration = illustration > 0.5

  const scores = {
    nudity_raw: nudityRaw,
    nudity_partial: nudityPartial,
    nudity_sexual: nuditySexual,
    nudity_explicit: nudityExplicit,
    gore,
    weapon,
    illustration,
  }

  // ── Hard rejections ────────────────────────────────────────────────────────
  let rejectReason: string | null = null
  if (nudityRaw > 0.3) rejectReason = 'nudity_raw'
  else if (nudityPartial > 0.75) rejectReason = 'nudity_partial'
  else if (nuditySexual > 0.3) rejectReason = 'nudity_sexual'
  else if (nudityExplicit > 0.4) rejectReason = 'nudity_explicit'
  else if (gore > 0.6) rejectReason = 'gore'

  if (rejectReason) {
    // Cartoons/memes get routed to human review instead of auto-reject —
    // nudity classifiers over-index on cartoon skin tones (e.g. Simpsons memes).
    if (isIllustration) {
      return { verdict: 'pending', reason: `${rejectReason}_illustration`, scores }
    }
    return { verdict: 'rejected', reason: rejectReason, scores }
  }

  // ── Flag for human review (borderline) ───────────────────────────────────
  let pendingReason: string | null = null
  if (nudityRaw > 0.15) pendingReason = 'nudity_raw_borderline'
  else if (nudityPartial > 0.5) pendingReason = 'nudity_partial_borderline'
  else if (nuditySexual > 0.15) pendingReason = 'nudity_sexual_borderline'
  else if (nudityExplicit > 0.2) pendingReason = 'nudity_explicit_borderline'
  else if (gore > 0.3) pendingReason = 'gore_borderline'
  else if (weapon > 0.85) pendingReason = 'weapon'

  if (pendingReason) {
    return { verdict: 'pending', reason: pendingReason, scores }
  }

  // ── Auto-approve (clean) ──────────────────────────────────────────────────
  return { verdict: 'approved', reason: null, scores }
}
