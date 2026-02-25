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
  if (!apiUser || !apiSecret) {
    console.log('[Sightengine] env vars not set — skipping moderation')
    return 'pending'
  }

  console.log('[Sightengine] calling API...')

  const form = new FormData()
  form.append('media', new Blob([bytes], { type: contentType }), 'image')
  form.append('models', 'nudity,gore,weapon')
  form.append('api_user', apiUser)
  form.append('api_secret', apiSecret)

  let data: any
  try {
    const res = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: form,
    })
    data = await res.json()
    console.log('[Sightengine] response:', JSON.stringify(data))
  } catch (err) {
    // Network / parse error — fail open, send to human review
    console.log('[Sightengine] fetch error:', err)
    return 'pending'
  }

  if (data.status !== 'success') {
    console.log('[Sightengine] non-success status:', data.status)
    return 'pending'
  }

  const nudityRaw = data.nudity?.raw ?? 0
  const nudityPartial = data.nudity?.partial ?? 0
  const gore = data.gore?.prob ?? 0
  const weapon = data.weapon?.prob ?? 0

  // ── Hard rejections (complete nudity only) ───────────────────────────────
  if (
    nudityRaw > 0.5 ||
    gore > 0.75
  ) {
    return 'rejected'
  }

  // ── Flag for human review (borderline) ───────────────────────────────────
  if (
    nudityRaw > 0.3 ||
    gore > 0.4 ||
    weapon > 0.75
  ) {
    return 'pending'
  }

  // ── Auto-approve (clean) ──────────────────────────────────────────────────
  console.log('[Sightengine] result: approved')
  return 'approved'
}
