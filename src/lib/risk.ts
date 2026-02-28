// Countries with disproportionately high rates of romance/sympathy scams
export const HIGH_RISK_COUNTRIES = [
  'Nigeria', 'Ghana', 'Cameroon', 'Senegal', 'Benin', 'Togo', 'Mali',
  'Guinea', 'Niger', 'Liberia', 'Sierra Leone', 'Gambia', 'Ivory Coast',
  "Côte d'Ivoire", 'Burkina Faso', 'Romania', 'Bulgaria',
]

export function computeRiskFlags(u: {
  signup_country: string | null
  city?: string | null
  state?: string | null
}): string[] {
  const flags: string[] = []
  if (!u.signup_country) return flags
  if (HIGH_RISK_COUNTRIES.includes(u.signup_country)) {
    flags.push(`High-risk country: ${u.signup_country}`)
  }
  if (u.signup_country !== 'United States' && (u.state || u.city)) {
    flags.push(`IP in ${u.signup_country} but claims US location`)
  }
  return flags
}
