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
  // Sightengine 2.1 returns a fanned-out class set; we store every score we
  // pull off the response so the admin tester / rejection cards can show why
  // an image was rejected. Open-shape on purpose — different models surface
  // different sub-classes.
  scores: Record<string, number> | null
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
  // nudity-2.1 (vs legacy `nudity` 1.0): separates bikini / cleavage /
  // lingerie / swimwear sub-scores from `sexual_display` (actual exposed
  // nipples + genitals) and `sexual_activity`. The 1.0 `partial` class
  // couldn't tell those apart and was rejecting bikini photos at 90%+.
  form.append('models', 'nudity-2.1,gore,weapon,type')
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

  // ── Sightengine 2.1 nudity classes ───────────────────────────────────────
  // Top-level (the ones we block on):
  //   sexual_activity   — sex acts / intercourse
  //   sexual_display    — visible nipples / genitals / anus
  //   erotica           — sexually-charged context, often w/ visible underwear
  // Suggestive bands (NOT blocked — used for telemetry only):
  //   very_suggestive / suggestive / mildly_suggestive
  // suggestive_classes (fine-grained — bikinis / lingerie / swimwear / male
  // chest / cleavage / etc. all live here and we pass them through).
  const n = data.nudity ?? {}
  const sexualActivity = n.sexual_activity ?? 0
  const sexualDisplay = n.sexual_display ?? 0
  const erotica = n.erotica ?? 0
  const verySuggestive = n.very_suggestive ?? 0
  const suggestive = n.suggestive ?? 0
  const sc = n.suggestive_classes ?? {}
  const bikini = sc.bikini ?? 0
  const cleavage = sc.cleavage ?? 0
  const lingerie = sc.lingerie ?? 0
  const swimwearOnePiece = sc.swimwear_one_piece ?? 0
  const swimwearMale = sc.swimwear_male ?? 0
  const maleChest = sc.male_chest ?? 0
  const visiblyUndressed = sc.visibly_undressed ?? 0

  const gore = data.gore?.prob ?? 0
  const weapon = data.weapon?.prob ?? 0
  const illustration = data.type?.illustration ?? 0
  const isIllustration = illustration > 0.5

  const scores: Record<string, number> = {
    sexual_activity: sexualActivity,
    sexual_display: sexualDisplay,
    erotica,
    very_suggestive: verySuggestive,
    suggestive,
    bikini,
    cleavage,
    lingerie,
    swimwear_one_piece: swimwearOnePiece,
    swimwear_male: swimwearMale,
    male_chest: maleChest,
    visibly_undressed: visiblyUndressed,
    gore,
    weapon,
    illustration,
  }

  // ── Hard rejections ────────────────────────────────────────────────────────
  // Calibrated to Facebook's Adult Nudity standard: allow bikinis / swimwear /
  // lingerie / cleavage; block exposed nipples + genitals + sex acts.
  let rejectReason: string | null = null
  if (sexualActivity > 0.5) rejectReason = 'sexual_activity'
  else if (sexualDisplay > 0.6) rejectReason = 'sexual_display'
  else if (visiblyUndressed > 0.6) rejectReason = 'visibly_undressed'
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
  // `erotica` set high (0.7) because bikini photos with strong posing can
  // score 0.4-0.6 here even on the 2.1 model; we'd rather pass-through and
  // let users report than auto-block legitimate beach shots.
  let pendingReason: string | null = null
  if (sexualActivity > 0.3) pendingReason = 'sexual_activity_borderline'
  else if (sexualDisplay > 0.4) pendingReason = 'sexual_display_borderline'
  else if (erotica > 0.7) pendingReason = 'erotica_borderline'
  else if (visiblyUndressed > 0.4) pendingReason = 'visibly_undressed_borderline'
  else if (gore > 0.3) pendingReason = 'gore_borderline'
  else if (weapon > 0.85) pendingReason = 'weapon'

  if (pendingReason) {
    return { verdict: 'pending', reason: pendingReason, scores }
  }

  // ── Auto-approve (clean) ──────────────────────────────────────────────────
  return { verdict: 'approved', reason: null, scores }
}
