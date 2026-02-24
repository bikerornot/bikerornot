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

export async function moderateImage(
  bytes: ArrayBuffer,
  contentType: string
): Promise<ModerationResult> {
  const apiUser = process.env.SIGHTENGINE_API_USER
  const apiSecret = process.env.SIGHTENGINE_API_SECRET

  // Not configured — fall through to human review
  if (!apiUser || !apiSecret) return 'pending'

  const form = new FormData()
  form.append('media', new Blob([bytes], { type: contentType }), 'image')
  form.append('models', 'nudity,gore,weapon,drugs')
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
    return 'pending'
  }

  if (data.status !== 'success') return 'pending'

  const nudity = data.nudity ?? {}
  const gore = data.gore?.prob ?? 0
  const weapon = data.weapon?.prob ?? 0
  const drugs = data.drug?.prob ?? 0

  // ── Hard rejections ───────────────────────────────────────────────────────
  if (
    (nudity.sexual_activity ?? 0) > 0.5 ||
    (nudity.sexual_display ?? 0) > 0.5 ||
    (nudity.erotica ?? 0) > 0.65 ||
    gore > 0.85
  ) {
    return 'rejected'
  }

  // ── Flag for human review (borderline) ───────────────────────────────────
  if (
    (nudity.very_suggestive ?? 0) > 0.6 ||
    (nudity.suggestive ?? 0) > 0.75 ||
    gore > 0.5 ||
    weapon > 0.85 ||
    drugs > 0.8
  ) {
    return 'pending'
  }

  // ── Auto-approve (clean) ──────────────────────────────────────────────────
  return 'approved'
}
