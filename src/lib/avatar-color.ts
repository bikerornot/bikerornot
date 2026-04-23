// Deterministic fallback avatar tint from a username or user id.
// Same input → same color forever, so the user's mental model of who they
// already know doesn't churn. 12 hues spread around the wheel picked in a
// saturated range that stays readable with white text on top.
//
// Keep the palette narrow on purpose — too many colors and the grid looks
// like confetti; too few and you see the same tint three times on one page.
const PALETTE = [
  '#EA580C', // orange-600 (brand-adjacent)
  '#DC2626', // red-600
  '#DB2777', // pink-600
  '#9333EA', // purple-600
  '#4F46E5', // indigo-600
  '#2563EB', // blue-600
  '#0891B2', // cyan-600
  '#059669', // emerald-600
  '#65A30D', // lime-600
  '#CA8A04', // yellow-600
  '#B45309', // amber-700
  '#475569', // slate-600
] as const

function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function avatarColorFor(key: string | null | undefined): string {
  if (!key) return PALETTE[0]
  return PALETTE[hashString(key) % PALETTE.length]
}

export function avatarInitials(firstName?: string | null, username?: string | null): string {
  const fi = firstName?.trim()?.[0]
  if (fi) return fi.toUpperCase()
  const u = username?.trim()?.replace(/^@/, '')
  if (u) return u[0].toUpperCase()
  return '?'
}
