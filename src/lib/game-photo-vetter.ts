import 'server-only'
import { getOpenAI } from './openai'

// Auto-vet a candidate game photo using GPT-4o-mini vision. The model
// returns a structured verdict; we map it to approve / reject / review.
//
// Cost: roughly $0.0002 per image at low detail with a tiny JSON output.
// Budget at any realistic submission rate is rounding error.
//
// Confidence threshold for auto-decisions is set high (0.85) on purpose:
// the goal is to remove the obvious cases from the manual queue, not to
// replace the moderator. Anything ambiguous is left for human review.

export type GameVetReason =
  | 'unidentifiable'
  | 'person_visible'
  | 'multiple_bikes_unclear_subject'
  | 'trike'

export interface GameVetResult {
  decision: 'approve' | 'reject' | 'review'
  reasons: GameVetReason[]
  confidence: number
  notes: string
}

const AUTO_DECIDE_THRESHOLD = 0.85

const SYSTEM_PROMPT = `You vet motorcycle photos for a "guess the bike" game. Apply these REJECT criteria strictly:

1. unidentifiable — image is so blurry, dark, distant, or shot from such an odd angle that the bike model is not recognizable
2. person_visible — a person's face, body, or rider is visible in the frame. Hands lightly touching the bike are OK; a rider sitting/standing on the bike or any face/body in the frame is NOT
3. multiple_bikes_unclear_subject — two or more bikes are visible AND there is no obvious primary subject (e.g., one in front and centered with others clearly background is OK; lineup of equally-prominent bikes is NOT)
4. trike — three-wheeled motorcycle (sidecars also count as not-a-standard-motorcycle and should be rejected)

Approve if NONE of those criteria apply. Be decisive on clear cases; use "review" only when genuinely ambiguous.

Respond with JSON only, no prose. Schema:
{
  "decision": "approve" | "reject" | "review",
  "reasons": ["unidentifiable" | "person_visible" | "multiple_bikes_unclear_subject" | "trike", ...],
  "confidence": 0.0..1.0,
  "notes": "one short sentence"
}

reasons array must be empty when decision is "approve". confidence is your self-assessed certainty in this verdict.`

export async function vetGamePhoto(imageUrl: string): Promise<GameVetResult> {
  const openai = getOpenAI()

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Vet this motorcycle photo per the criteria.' },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
        ],
      },
    ],
    max_tokens: 200,
    temperature: 0.1,
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      decision: 'review',
      reasons: [],
      confidence: 0,
      notes: `Vetter returned malformed JSON: ${raw.slice(0, 120)}`,
    }
  }

  const decision = ['approve', 'reject', 'review'].includes(parsed.decision) ? parsed.decision : 'review'
  const reasons = Array.isArray(parsed.reasons)
    ? (parsed.reasons.filter((r: unknown) =>
        ['unidentifiable', 'person_visible', 'multiple_bikes_unclear_subject', 'trike'].includes(r as string),
      ) as GameVetReason[])
    : []
  const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0
  const notes = typeof parsed.notes === 'string' ? parsed.notes.slice(0, 280) : ''

  return { decision, reasons, confidence, notes }
}

// Translates the vetter result into the final auto-action: approve, reject,
// or leave for manual review. High confidence is required for auto-decide.
export function shouldAutoDecide(result: GameVetResult): 'approve' | 'reject' | null {
  if (result.confidence < AUTO_DECIDE_THRESHOLD) return null
  if (result.decision === 'approve') return 'approve'
  if (result.decision === 'reject') return 'reject'
  return null
}
