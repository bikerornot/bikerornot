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

// Top /16 prefixes for the cloud / VPS providers most commonly used to
// spin up disposable scam accounts. Real US users sign up from residential
// ISPs (Comcast, AT&T, Charter, etc.) — they don't sign up from a Linode
// box. This list is intentionally conservative; it'll miss some VPN exits
// but won't false-positive on real users.
const DATACENTER_PREFIXES = [
  // Linode
  '45.33.', '45.56.', '45.79.', '50.116.', '69.164.', '96.126.',
  '139.144.', '172.104.', '172.105.', '173.255.',
  // DigitalOcean
  '64.227.', '68.183.', '104.131.', '107.170.', '138.197.', '138.68.',
  '139.59.', '142.93.', '143.198.', '146.190.', '157.230.', '157.245.',
  '159.65.', '159.89.', '161.35.', '164.90.', '164.92.', '165.227.',
  '167.71.', '167.99.', '174.138.', '178.128.', '178.62.', '188.166.',
  '198.199.', '206.189.', '207.154.',
  // Vultr
  '45.32.', '45.63.', '45.76.', '45.77.', '108.61.', '149.28.',
  '149.248.', '155.138.', '199.247.',
  // OVH (heavily used by EU-based scammers)
  '51.38.', '51.68.', '51.75.', '51.83.', '51.89.', '51.91.',
  '51.158.', '51.178.', '51.210.', '51.222.', '51.255.',
  '54.36.', '54.37.', '54.38.', '54.39.',
  '92.222.', '94.23.', '149.202.', '167.114.', '178.32.',
  // M247 / Hostwinds / ColoCrossing — popular cheap scammer VPS
  '23.108.', '46.166.', '109.205.', '146.70.',
]

export function isDatacenterIP(ip: string | null): boolean {
  if (!ip) return false
  return DATACENTER_PREFIXES.some((prefix) => ip.startsWith(prefix))
}
