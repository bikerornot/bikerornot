// Pure scammer scoring logic — no database calls

export interface ScammerInput {
  // Profile
  accountAgeDays: number
  bio: string | null
  ridingStyle: string[] | null
  postCount: number
  commentCount: number
  profileCity: string | null
  profileState: string | null
  signupCountry: string | null
  signupCity: string | null
  gender: string | null
  bikeCount: number

  // Messages
  messagesSent: Array<{ content: string; created_at: string; recipient_id: string | null }>
  messagesReceivedCount: number

  // Conversations: how many the user initiated (sent the first message)
  conversationsInitiated: number
  conversationsTotal: number

  // Friend requests
  friendRequestsSent: Array<{ created_at: string; status: string }>
  friendRequestsReceivedCount: number

  // Community signals
  reportsAgainstCount: number
  blocksAgainstCount: number
  contentFlagsCount: number
}

export interface CategoryScore {
  name: string
  points: number
  maxPoints: number
  findings: string[]
}

export interface ScammerResult {
  totalScore: number
  grade: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  gradeColor: string
  categories: CategoryScore[]
  topFindings: string[]
}

// ─── Keyword lists ───────────────────────────────────────────────────────────

const ROMANCE_KEYWORDS = [
  'late husband', 'late wife', 'are you married', 'are you single',
  'i am lonely', 'i am a widow', 'looking for love', 'soulmate',
  'my dear', 'my love', 'sweetheart', 'honey', 'i miss you so much',
  'god brought us together', 'you are beautiful', 'you are handsome',
  'i want to spend my life', 'true love', 'fall in love',
]

const OFF_PLATFORM_KEYWORDS = [
  'whatsapp', 'hangouts', 'google chat', 'telegram', 'signal app',
  'send me your number', 'give me your number', 'text me at',
  'call me at', 'my number is', 'let\'s talk off',
  'personal email', 'private email',
]

const FINANCIAL_KEYWORDS = [
  'gift card', 'itunes card', 'google play card', 'steam card',
  'crypto', 'bitcoin', 'western union', 'moneygram', 'wire transfer',
  'bank account', 'send money', 'cash app', 'zelle', 'venmo',
  'financial help', 'loan', 'invest', 'inheritance',
  'stuck abroad', 'stranded', 'hospital bill', 'customs fee',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))
  if (wordsA.size === 0 && wordsB.size === 0) return 1
  let intersection = 0
  for (const w of wordsA) if (wordsB.has(w)) intersection++
  const union = wordsA.size + wordsB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// ─── Category scorers ────────────────────────────────────────────────────────

function scoreMessagePatterns(input: ScammerInput): CategoryScore {
  const MAX = 20
  const findings: string[] = []
  let points = 0

  const { messagesSent, accountAgeDays } = input
  const days = Math.max(accountAgeDays, 1)
  const msgsPerDay = messagesSent.length / days

  // High message volume
  if (msgsPerDay > 20) {
    points += 8
    findings.push(`Very high message volume: ${msgsPerDay.toFixed(1)} messages/day`)
  } else if (msgsPerDay > 10) {
    points += 5
    findings.push(`High message volume: ${msgsPerDay.toFixed(1)} messages/day`)
  } else if (msgsPerDay > 5) {
    points += 3
    findings.push(`Moderate message volume: ${msgsPerDay.toFixed(1)} messages/day`)
  }

  // Unique recipients
  const uniqueRecipients = new Set(messagesSent.map((m) => m.recipient_id).filter(Boolean))
  if (uniqueRecipients.size > 15) {
    points += 7
    findings.push(`Messaging ${uniqueRecipients.size} unique recipients`)
  } else if (uniqueRecipients.size > 8) {
    points += 4
    findings.push(`Messaging ${uniqueRecipients.size} unique recipients`)
  }

  // All-outbound conversations
  if (input.conversationsTotal > 0 && input.conversationsInitiated === input.conversationsTotal) {
    points += 5
    findings.push(`Initiated all ${input.conversationsTotal} conversations (0 incoming)`)
  } else if (input.conversationsTotal > 2 && input.conversationsInitiated / input.conversationsTotal > 0.8) {
    points += 3
    findings.push(`Initiated ${input.conversationsInitiated}/${input.conversationsTotal} conversations`)
  }

  return { name: 'Message Patterns', points: clamp(points, 0, MAX), maxPoints: MAX, findings }
}

function scoreCopyPaste(input: ScammerInput): CategoryScore {
  const MAX = 20
  const findings: string[] = []
  let points = 0

  // Group messages by recipient to detect same messages sent to different people
  const byRecipient = new Map<string, string[]>()
  for (const m of input.messagesSent) {
    if (!m.recipient_id) continue
    const list = byRecipient.get(m.recipient_id) ?? []
    list.push(m.content)
    byRecipient.set(m.recipient_id, list)
  }

  // Collect all unique messages per recipient, then cross-compare
  const recipientMessages = [...byRecipient.entries()]
  let exactDupes = 0
  let nearDupes = 0
  const seenPairs = new Set<string>()

  for (let i = 0; i < recipientMessages.length; i++) {
    for (let j = i + 1; j < recipientMessages.length; j++) {
      const [, msgsA] = recipientMessages[i]
      const [, msgsB] = recipientMessages[j]
      for (const a of msgsA) {
        if (a.length < 20) continue // skip very short messages
        for (const b of msgsB) {
          if (b.length < 20) continue
          const pairKey = [a, b].sort().join('|||')
          if (seenPairs.has(pairKey)) continue
          seenPairs.add(pairKey)
          if (a === b) {
            exactDupes++
          } else if (jaccardSimilarity(a, b) >= 0.8) {
            nearDupes++
          }
        }
      }
    }
  }

  if (exactDupes > 5) {
    points += 12
    findings.push(`${exactDupes} exact duplicate messages sent to different recipients`)
  } else if (exactDupes > 2) {
    points += 7
    findings.push(`${exactDupes} exact duplicate messages sent to different recipients`)
  } else if (exactDupes > 0) {
    points += 3
    findings.push(`${exactDupes} exact duplicate message(s) sent to different recipients`)
  }

  if (nearDupes > 5) {
    points += 8
    findings.push(`${nearDupes} near-duplicate messages (≥80% word similarity)`)
  } else if (nearDupes > 2) {
    points += 5
    findings.push(`${nearDupes} near-duplicate messages (≥80% word similarity)`)
  } else if (nearDupes > 0) {
    points += 2
    findings.push(`${nearDupes} near-duplicate message(s) (≥80% word similarity)`)
  }

  return { name: 'Copy-Paste Detection', points: clamp(points, 0, MAX), maxPoints: MAX, findings }
}

function scoreFriendRequestVelocity(input: ScammerInput): CategoryScore {
  const MAX = 15
  const findings: string[] = []
  let points = 0

  const { friendRequestsSent, accountAgeDays } = input
  const days = Math.max(accountAgeDays, 1)
  const perDay = friendRequestsSent.length / days

  if (perDay > 10) {
    points += 6
    findings.push(`${perDay.toFixed(1)} friend requests/day`)
  } else if (perDay > 5) {
    points += 4
    findings.push(`${perDay.toFixed(1)} friend requests/day`)
  } else if (perDay > 2) {
    points += 2
    findings.push(`${perDay.toFixed(1)} friend requests/day`)
  }

  // Burst detection: 5+ in a 1-hour window
  const timestamps = friendRequestsSent.map((f) => new Date(f.created_at).getTime()).sort()
  let maxBurst = 0
  for (let i = 0; i < timestamps.length; i++) {
    let count = 1
    for (let j = i + 1; j < timestamps.length; j++) {
      if (timestamps[j] - timestamps[i] <= 3600000) count++
      else break
    }
    maxBurst = Math.max(maxBurst, count)
  }
  if (maxBurst >= 10) {
    points += 5
    findings.push(`Burst of ${maxBurst} friend requests in 1-hour window`)
  } else if (maxBurst >= 5) {
    points += 3
    findings.push(`Burst of ${maxBurst} friend requests in 1-hour window`)
  }

  // Low acceptance rate
  const accepted = friendRequestsSent.filter((f) => f.status === 'accepted').length
  const total = friendRequestsSent.length
  if (total >= 5) {
    const rate = accepted / total
    if (rate < 0.1) {
      points += 4
      findings.push(`Very low friend request acceptance rate: ${(rate * 100).toFixed(0)}% (${accepted}/${total})`)
    } else if (rate < 0.3) {
      points += 2
      findings.push(`Low friend request acceptance rate: ${(rate * 100).toFixed(0)}% (${accepted}/${total})`)
    }
  }

  return { name: 'Friend Request Velocity', points: clamp(points, 0, MAX), maxPoints: MAX, findings }
}

function scoreOutboundInbound(input: ScammerInput): CategoryScore {
  const MAX = 15
  const findings: string[] = []
  let points = 0

  // Message ratio
  const totalSent = input.messagesSent.length
  const totalReceived = input.messagesReceivedCount
  if (totalSent > 10 && totalReceived === 0) {
    points += 8
    findings.push(`${totalSent} messages sent, 0 received — entirely one-directional`)
  } else if (totalSent > 10 && totalReceived > 0) {
    const ratio = totalSent / totalReceived
    if (ratio > 5) {
      points += 6
      findings.push(`Outbound message ratio ${ratio.toFixed(1)}:1 (${totalSent} sent / ${totalReceived} received)`)
    } else if (ratio > 3) {
      points += 3
      findings.push(`Outbound message ratio ${ratio.toFixed(1)}:1 (${totalSent} sent / ${totalReceived} received)`)
    }
  }

  // Friend request ratio
  const frSent = input.friendRequestsSent.length
  const frReceived = input.friendRequestsReceivedCount
  if (frSent > 5 && frReceived === 0) {
    points += 7
    findings.push(`${frSent} friend requests sent, 0 received`)
  } else if (frSent > 5 && frReceived > 0) {
    const ratio = frSent / frReceived
    if (ratio > 5) {
      points += 5
      findings.push(`Friend request ratio ${ratio.toFixed(1)}:1 sent vs received`)
    } else if (ratio > 3) {
      points += 3
      findings.push(`Friend request ratio ${ratio.toFixed(1)}:1 sent vs received`)
    }
  }

  return { name: 'Outbound/Inbound Ratio', points: clamp(points, 0, MAX), maxPoints: MAX, findings }
}

function scoreKeywords(input: ScammerInput): CategoryScore {
  const MAX = 15
  const findings: string[] = []
  let points = 0

  const allText = input.messagesSent.map((m) => m.content.toLowerCase()).join(' ')

  function countKeywords(keywords: string[], label: string, maxPts: number): number {
    const found = keywords.filter((kw) => allText.includes(kw))
    if (found.length >= 5) {
      findings.push(`${found.length} ${label} keywords detected: "${found.slice(0, 3).join('", "')}"...`)
      return maxPts
    } else if (found.length >= 2) {
      findings.push(`${found.length} ${label} keywords: "${found.slice(0, 3).join('", "')}"`)
      return Math.ceil(maxPts * 0.6)
    } else if (found.length === 1) {
      findings.push(`${label} keyword: "${found[0]}"`)
      return Math.ceil(maxPts * 0.3)
    }
    return 0
  }

  points += countKeywords(ROMANCE_KEYWORDS, 'romance scam', 6)
  points += countKeywords(OFF_PLATFORM_KEYWORDS, 'off-platform', 5)
  points += countKeywords(FINANCIAL_KEYWORDS, 'financial', 6)

  return { name: 'Keyword Flags', points: clamp(points, 0, MAX), maxPoints: MAX, findings }
}

function scoreProfileEngagement(input: ScammerInput): CategoryScore {
  const MAX = 15
  const findings: string[] = []
  let points = 0

  // Heavy messaging but zero posts/comments
  if (input.messagesSent.length > 10 && input.postCount === 0 && input.commentCount === 0) {
    points += 5
    findings.push(`${input.messagesSent.length} messages sent but 0 posts and 0 comments — no public engagement`)
  } else if (input.messagesSent.length > 10 && input.postCount === 0) {
    points += 3
    findings.push(`${input.messagesSent.length} messages sent but 0 posts`)
  }

  // No bio or riding style
  if (!input.bio && (!input.ridingStyle || input.ridingStyle.length === 0)) {
    points += 3
    findings.push('No bio and no riding style set — minimal profile effort')
  }

  // No bike + male + messaging activity. Strongest signal we have:
  // historical ban rates among male users — 67% for "no bike + 20+ msgs",
  // 28% for "no bike + 6-20 msgs", 19% for "no bike + 1-5 msgs", vs ~1%
  // for males WITH a bike at the same volumes. Weight accordingly.
  if (input.gender === 'male' && input.bikeCount === 0) {
    const msgs = input.messagesSent.length
    if (msgs >= 20) {
      points += 5
      findings.push(`Male, no bike in garage, ${msgs} messages sent — strongest scammer signal (67% historical ban rate)`)
    } else if (msgs >= 6) {
      points += 3
      findings.push(`Male, no bike in garage, ${msgs} messages sent — high-risk pattern (28% historical ban rate)`)
    } else if (msgs >= 1) {
      points += 1
      findings.push(`Male, no bike in garage, ${msgs} message(s) sent — elevated risk (19% historical ban rate)`)
    }
  }

  // Geographic inconsistency: signup country vs profile location
  if (input.signupCountry && input.profileState) {
    const usStates = input.signupCountry === 'US' || input.signupCountry === 'United States'
    if (!usStates && input.profileCity) {
      points += 2
      findings.push(`Signed up from ${input.signupCountry} but profile shows ${input.profileCity}, ${input.profileState}`)
    }
  }

  return { name: 'Profile & Engagement', points: clamp(points, 0, MAX), maxPoints: MAX, findings }
}

function scoreCommunitySignals(input: ScammerInput): CategoryScore {
  const MAX = 5
  const findings: string[] = []
  let points = 0

  if (input.reportsAgainstCount > 3) {
    points += 2
    findings.push(`${input.reportsAgainstCount} reports filed against this user`)
  } else if (input.reportsAgainstCount > 0) {
    points += 1
    findings.push(`${input.reportsAgainstCount} report(s) filed against this user`)
  }

  if (input.blocksAgainstCount > 3) {
    points += 2
    findings.push(`Blocked by ${input.blocksAgainstCount} users`)
  } else if (input.blocksAgainstCount > 0) {
    points += 1
    findings.push(`Blocked by ${input.blocksAgainstCount} user(s)`)
  }

  if (input.contentFlagsCount > 0) {
    points += 1
    findings.push(`${input.contentFlagsCount} AI content flag(s)`)
  }

  return { name: 'Community Signals', points: clamp(points, 0, MAX), maxPoints: MAX, findings }
}

// ─── Main scorer ─────────────────────────────────────────────────────────────

function getGrade(score: number): { grade: ScammerResult['grade']; gradeColor: string } {
  if (score <= 25) return { grade: 'LOW', gradeColor: 'green' }
  if (score <= 50) return { grade: 'MEDIUM', gradeColor: 'yellow' }
  if (score <= 75) return { grade: 'HIGH', gradeColor: 'orange' }
  return { grade: 'CRITICAL', gradeColor: 'red' }
}

export function computeScammerScore(input: ScammerInput): ScammerResult {
  const categories = [
    scoreMessagePatterns(input),
    scoreCopyPaste(input),
    scoreFriendRequestVelocity(input),
    scoreOutboundInbound(input),
    scoreKeywords(input),
    scoreProfileEngagement(input),
    scoreCommunitySignals(input),
  ]

  const totalScore = clamp(
    categories.reduce((sum, c) => sum + c.points, 0),
    0,
    100,
  )

  const { grade, gradeColor } = getGrade(totalScore)

  // Top findings: sorted by category points (desc), take top 5
  const topFindings = [...categories]
    .sort((a, b) => b.points - a.points)
    .flatMap((c) => c.findings)
    .slice(0, 5)

  return { totalScore, grade, gradeColor, categories, topFindings }
}
