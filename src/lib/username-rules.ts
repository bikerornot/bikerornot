/**
 * Username validation: reserved words, impersonation prevention, and profanity filter.
 *
 * Returns null if the username is acceptable, or an error message string if blocked.
 */

// Exact usernames that are reserved (system, brand, roles)
const RESERVED_EXACT = new Set([
  'bikerornot',
  'admin',
  'administrator',
  'moderator',
  'support',
  'help',
  'official',
  'system',
  'bot',
  'root',
  'staff',
  'team',
  'security',
  'info',
  'contact',
  'abuse',
  'postmaster',
  'webmaster',
  'noreply',
  'null',
  'undefined',
  'test',
  'demo',
])

// Substrings that cannot appear anywhere in a username
const BLOCKED_SUBSTRINGS = [
  'admin',
  'moderator',
  'bikerornot',
]

// Profanity list — common slurs and vulgarities
// Kept compact: covers the words most likely to appear in usernames
const PROFANITY = [
  'fuck',
  'shit',
  'cunt',
  'bitch',
  'dick',
  'cock',
  'pussy',
  'asshole',
  'bastard',
  'damn',
  'whore',
  'slut',
  'fag',
  'faggot',
  'nigger',
  'nigga',
  'retard',
  'twat',
  'wank',
  'piss',
  'porn',
  'anal',
  'dildo',
  'penis',
  'vagina',
  'tits',
  'boobs',
  'jizz',
  'cum',
  'rape',
  'molest',
  'pedo',
  'nazi',
  'hitler',
  'kike',
  'spic',
  'chink',
  'gook',
  'wetback',
  'beaner',
  'tranny',
  'dyke',
]

export function validateUsername(username: string): string | null {
  const lower = username.toLowerCase()

  if (RESERVED_EXACT.has(lower)) {
    return 'This username is reserved.'
  }

  for (const sub of BLOCKED_SUBSTRINGS) {
    if (lower.includes(sub)) {
      return 'This username is not allowed.'
    }
  }

  for (const word of PROFANITY) {
    if (lower.includes(word)) {
      return 'This username contains inappropriate language.'
    }
  }

  return null
}
