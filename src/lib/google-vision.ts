import 'server-only'

/**
 * Google Cloud Vision API — Web Detection
 *
 * Checks if an image appears elsewhere on the internet (reverse image search).
 * Used to detect catfish / stolen profile photos.
 *
 * Required env var: GOOGLE_CLOUD_VISION_API_KEY
 */

export interface WebMatch {
  url: string
  pageTitle: string | null
  score: number | null
}

export interface WebDetectionResult {
  /** Number of pages where this exact image (or close crop) was found */
  matchCount: number
  /** Top matching pages (max 10) */
  topMatches: WebMatch[]
  /** Best-guess label Google assigns to the image */
  bestGuess: string | null
  /** Whether this image likely appears on other sites */
  isSuspicious: boolean
  /** Raw timestamp of when the check was performed */
  checkedAt: string
}

export async function detectWebPresence(
  imageBytes: ArrayBuffer,
  contentType: string
): Promise<WebDetectionResult | null> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
  if (!apiKey) return null

  const base64 = Buffer.from(imageBytes).toString('base64')

  let data: any
  try {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: 'WEB_DETECTION', maxResults: 20 }],
            },
          ],
        }),
      }
    )
    data = await res.json()
  } catch {
    return null
  }

  const web = data?.responses?.[0]?.webDetection
  if (!web) return null

  // Full matches = exact image found on other pages
  const fullMatches: WebMatch[] = (web.pagesWithMatchingImages ?? [])
    .slice(0, 10)
    .map((p: any) => ({
      url: p.url ?? '',
      pageTitle: p.pageTitle ?? null,
      score: p.score ?? null,
    }))

  // Partial matches = cropped or edited versions
  const partialCount = (web.partialMatchingImages ?? []).length

  const matchCount = fullMatches.length + partialCount
  const bestGuess = web.bestGuessLabels?.[0]?.label ?? null

  // Flag as suspicious if the image appears on 2+ other sites
  const isSuspicious = matchCount >= 2

  return {
    matchCount,
    topMatches: fullMatches,
    bestGuess,
    isSuspicious,
    checkedAt: new Date().toISOString(),
  }
}
