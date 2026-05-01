'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getOpenAI } from '@/lib/openai'
import { isDatacenterIP } from '@/lib/risk'
import { scanScamSignals } from '@/lib/scammer-score'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Compares the digit suffix of an email's local part against the user's
// birth year. Real users frequently signed up for their email in their
// teens/20s and incorporated their birth year (e.g. mike1972@gmail.com
// with DOB 1972). Scammers use bot-generated emails where the digits
// are random — they don't align with the fake DOB the scammer picked
// at signup. So an aligned year is a *positive* signal for legitimacy
// that the AI can weigh against negative signals.
type EmailBirthYearCorrelation = 'exact_4_digit' | 'exact_2_digit' | 'none'

function correlateEmailBirthYear(email: string | null, dobIso: string | null): EmailBirthYearCorrelation {
  if (!email || !dobIso) return 'none'
  const local = email.split('@')[0]
  if (!local) return 'none'
  const birthYear = new Date(dobIso).getUTCFullYear()
  if (!Number.isFinite(birthYear)) return 'none'
  const yyyy = String(birthYear)
  const yy = yyyy.slice(-2)
  // Trailing digit run before @, e.g. "harleymike1972" → "1972"
  const trailing = local.match(/(\d+)$/)?.[1] ?? ''
  if (trailing.length >= 4 && trailing.slice(-4) === yyyy) return 'exact_4_digit'
  if (trailing.length >= 2 && trailing.slice(-2) === yy) return 'exact_2_digit'
  return 'none'
}

async function requireAdminOrMod() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'moderator', 'super_admin'].includes(profile.role)) {
    throw new Error('Not authorized')
  }
  return user.id
}

// `likely_victim` — the flagged user appears to be RESPONDING to a scammer
// (e.g. shared a phone number only after the other user asked for it).
// Surfaces the actual perpetrator under `counter_party_concern`.
export type AIVerdictLabel = 'likely_scammer' | 'likely_real' | 'likely_victim' | 'needs_human'
export type AIVerdictAction = 'ban' | 'remove_content' | 'dismiss' | 'human_review' | 'ban_counter_party'

export interface CounterPartyConcern {
  user_id: string | null
  username: string | null
  first_name: string | null
  profile_photo_url: string | null
  status: string | null   // 'active' | 'banned' | 'suspended' | etc.
  label: AIVerdictLabel
  rationale: string
}

export interface AIVerdict {
  label: AIVerdictLabel
  confidence: number  // 0-100
  rationale: string   // 1-4 sentence summary
  recommended_action: AIVerdictAction
  // Populated when the FLAGGED user looks like a victim/responder and the
  // OTHER user in the conversation looks like the actual scammer. Only
  // available when the verdict was requested with a conversation_id.
  counter_party_concern: CounterPartyConcern | null
  generated_at: string
}

// One-shot AI verdict on a reported user. Pulls profile + activity context,
// asks GPT-4o-mini for a structured judgment, returns it. When called from
// the AI Flags page with a `conversationId`, also pulls the OTHER user's
// profile + the full transcript so the AI can tell whether the flagged user
// is actually the scammer or just RESPONDING to one (e.g. sharing their
// phone number only because the other user asked for it).
export async function getReportAIVerdict(
  authorId: string,
  conversationId?: string | null,
): Promise<AIVerdict | { error: string }> {
  await requireAdminOrMod()
  const admin = getServiceClient()

  const [profileRes, bikesRes, postsRes, msgsRes, frRes] = await Promise.all([
    admin.from('profiles').select('username, first_name, last_name, gender, date_of_birth, bio, riding_style, city, state, country, signup_ip, signup_country, signup_city, phone_number, phone_verified_at, created_at, last_seen_at, status').eq('id', authorId).single(),
    admin.from('user_bikes').select('id, year, make, model').eq('user_id', authorId),
    admin.from('posts').select('id, content, created_at').eq('author_id', authorId).is('deleted_at', null).order('created_at', { ascending: false }).limit(10),
    admin.from('messages').select('content, conversation_id, created_at').eq('sender_id', authorId).order('created_at', { ascending: true }).limit(300),
    admin.from('friendships').select('status, created_at').eq('requester_id', authorId),
  ])

  const profile: any = profileRes.data
  if (!profile) return { error: 'Author not found' }

  const bikes = bikesRes.data ?? []
  const posts = postsRes.data ?? []
  const msgs = msgsRes.data ?? []
  const friendRequests = frRes.data ?? []

  const accountAgeDays = Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86_400_000)

  // ── "Scammer magnet" positive signal ──────────────────────────────────────
  // Real bikers are the INTENDED TARGETS of scammers. Active users get DMed
  // by scammers constantly, so a user with multiple prior conversation
  // partners who have since been banned looks like a real person that
  // scammers keep finding — not a scammer themselves. We surface both the
  // raw count and the ratio (banned / total partners).
  const conversationIds = Array.from(new Set(msgs.map((m: any) => m.conversation_id).filter(Boolean) as string[]))
  let bannedPartnersCount = 0
  let totalPartnersCount = 0
  // Female-recipient age skew — driven by an empirical pattern in our banned
  // user set: male scammers who claim age <50 target women ~10-22 years
  // older. A young-claimed male profile messaging mostly older women is
  // therefore a strong scammer signal.
  let femaleRecipientCount = 0
  let avgFemaleRecipientAge: number | null = null
  let targetAgeSkew: number | null = null  // avg female recipient age − this user's age
  if (conversationIds.length > 0) {
    const { data: convs } = await admin
      .from('conversations')
      .select('id, participant1_id, participant2_id')
      .in('id', conversationIds)
    const partnerIds = new Set<string>()
    for (const c of (convs ?? []) as any[]) {
      const otherId = c.participant1_id === authorId ? c.participant2_id : c.participant1_id
      if (otherId) partnerIds.add(otherId)
    }
    totalPartnersCount = partnerIds.size
    if (partnerIds.size > 0) {
      const { data: partners } = await admin
        .from('profiles')
        .select('id, status, gender, date_of_birth')
        .in('id', Array.from(partnerIds))
      const partnersList = (partners ?? []) as any[]
      bannedPartnersCount = partnersList.filter((p) => p.status === 'banned').length

      const femaleAges = partnersList
        .filter((p) => p.gender === 'female' && p.date_of_birth)
        .map((p) => {
          const ageMs = Date.now() - new Date(p.date_of_birth).getTime()
          return ageMs / (365.25 * 86_400_000)
        })
        .filter((a) => a >= 18 && a <= 100)
      femaleRecipientCount = femaleAges.length
      if (femaleAges.length > 0) {
        avgFemaleRecipientAge = +(femaleAges.reduce((a, b) => a + b, 0) / femaleAges.length).toFixed(1)
        if (profile.date_of_birth) {
          const userAge = (Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 86_400_000)
          targetAgeSkew = +(avgFemaleRecipientAge - userAge).toFixed(1)
        }
      }
    }
  }

  // Email lives in auth.users (not profiles), pulled via the auth admin API.
  // Used to compute the email/birth-year correlation positive signal.
  let userEmail: string | null = null
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(authorId)
    userEmail = authUser?.user?.email ?? null
  } catch {
    // Non-fatal — verdict still works without the correlation signal
  }
  const emailBirthYearCorrelation = correlateEmailBirthYear(userEmail, profile.date_of_birth)

  // ── Optional: pull the counter-party for the flagged conversation ────────
  // When the verdict is requested from the AI Flags page, we know which
  // conversation triggered the flag. Fetching the OTHER user's profile +
  // both sides of the transcript lets the AI tell whether the flagged user
  // is actually the perpetrator or just RESPONDING to one (e.g. shared a
  // phone number only because the scammer asked for it). Without this
  // context, an honest user gets falsely flagged for replying with their
  // number after a scammer demanded it.
  let counterParty: any = null
  let counterPartySignalHits: ReturnType<typeof scanScamSignals> | null = null
  let counterPartyAgeDays: number | null = null
  let counterPartyBikes = 0
  let transcript: Array<{ from: 'flagged_user' | 'other_user'; username: string; content: string; created_at: string }> = []

  if (conversationId) {
    const { data: conv } = await admin
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', conversationId)
      .single()
    const otherId = conv && (conv.participant1_id === authorId ? conv.participant2_id : conv.participant1_id)

    if (otherId) {
      const [otherProfileRes, otherBikesRes, otherMsgsRes, allMsgsRes] = await Promise.all([
        admin.from('profiles').select('id, username, first_name, last_name, gender, date_of_birth, bio, signup_ip, signup_country, created_at, status, profile_photo_url').eq('id', otherId).single(),
        admin.from('user_bikes').select('id').eq('user_id', otherId),
        admin.from('messages').select('content, created_at').eq('sender_id', otherId).order('created_at', { ascending: true }).limit(300),
        admin.from('messages').select('sender_id, content, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(120),
      ])

      counterParty = otherProfileRes.data
      counterPartyBikes = (otherBikesRes.data ?? []).length
      counterPartyAgeDays = counterParty ? Math.floor((Date.now() - new Date(counterParty.created_at).getTime()) / 86_400_000) : null

      const otherMsgs = (otherMsgsRes.data ?? []) as any[]
      const otherMsgContent = otherMsgs.map((m) => m.content).filter(Boolean) as string[]
      counterPartySignalHits = scanScamSignals(otherMsgContent)

      // Full conversation transcript with explicit role labels so the AI can
      // see exactly who asked for the number / pivot first.
      transcript = ((allMsgsRes.data ?? []) as any[]).map((m) => ({
        from: m.sender_id === authorId ? 'flagged_user' : 'other_user',
        username: m.sender_id === authorId ? profile.username : (counterParty?.username ?? 'other_user'),
        content: (m.content ?? '').slice(0, 500),
        created_at: m.created_at,
      }))
    }
  }

  // First message per conversation to detect copy-paste opener pattern
  const firstByConv = new Map<string, string>()
  for (const m of msgs) {
    if (!m.content || firstByConv.has(m.conversation_id)) continue
    firstByConv.set(m.conversation_id, m.content)
  }
  const openers = Array.from(firstByConv.values())

  // Pre-scan EVERY sent message for the high-signal scam patterns: trying to
  // move off-platform (WhatsApp / phone number / email), asking for money,
  // and romance-scam scripting. Pulling these out here means the AI can't
  // miss them even if it skims the raw transcript.
  const allMsgContent = msgs.map((m: any) => m.content as string | null).filter(Boolean) as string[]
  const scamSignalHits = scanScamSignals(allMsgContent)
  const totalDmChars = allMsgContent.reduce((sum, t) => sum + t.length, 0)

  // Quoted excerpts of every message that contained an off-platform / financial
  // keyword — gives the AI exact citations to reason from instead of just a
  // count, and lets the rationale come back with a real example to show the VA.
  const sensitiveSnippets = allMsgContent
    .filter((t) => {
      const lower = t.toLowerCase()
      return scamSignalHits.off_platform_hits.some((k) => lower.includes(k.toLowerCase()))
        || scamSignalHits.financial_hits.some((k) => lower.includes(k.toLowerCase()))
        || /[\w.+-]+@[\w-]+\.[\w.-]+/.test(t)
        || /(?:\+?\d[\s().-]?){7,15}\d/.test(t)
    })
    .slice(0, 12)
    .map((t) => t.slice(0, 240))

  const context = {
    username: profile.username,
    first_name: profile.first_name,
    last_name: profile.last_name,
    gender: profile.gender,
    age: profile.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 86_400_000)) : null,
    bio: profile.bio,
    riding_style: profile.riding_style,
    profile_location: [profile.city, profile.state, profile.country].filter(Boolean).join(', '),
    signup_ip: profile.signup_ip,
    signup_ip_is_datacenter: isDatacenterIP(profile.signup_ip),
    signup_country: profile.signup_country,
    signup_city: profile.signup_city,
    phone_number: profile.phone_number,
    phone_verified: !!profile.phone_verified_at,
    email: userEmail,
    // Positive signal — when the trailing digits of the email's local part
    // match the user's birth year, this is almost always a real person who
    // chose the email in their teens/20s and carried it forward. Scammers
    // use bot-generated emails where digits don't correlate with their
    // (fake) chosen DOB.
    email_birth_year_correlation: emailBirthYearCorrelation,
    account_age_days: accountAgeDays,
    status: profile.status,
    bikes_in_garage: bikes.length,
    bike_examples: bikes.slice(0, 3).map((b: any) => `${b.year ?? ''} ${b.make ?? ''} ${b.model ?? ''}`.trim()).filter(Boolean),
    post_count: posts.length,
    recent_posts: posts.slice(0, 5).map((p: any) => p.content?.slice(0, 200)).filter(Boolean),
    messages_sent_count: msgs.length,
    messages_sent_total_chars: totalDmChars,
    distinct_conversations: firstByConv.size,
    // "Scammer magnet" — positive signal. Real bikers attract scammers.
    total_conversation_partners: totalPartnersCount,
    banned_conversation_partners_count: bannedPartnersCount,
    banned_partner_ratio: totalPartnersCount > 0 ? +(bannedPartnersCount / totalPartnersCount).toFixed(2) : 0,
    // Target-age skew — empirical pattern in our banned-user set:
    // male scammers who claim <50 target women ~10-22 years older. Use
    // alongside the user's claimed age + gender to spot the predator
    // pattern of a young-claimed man DMing much older women.
    female_recipient_count: femaleRecipientCount,
    avg_female_recipient_age: avgFemaleRecipientAge,
    target_age_skew_years: targetAgeSkew,
    friend_requests_sent: friendRequests.length,
    sample_openers: openers.slice(0, 12),
    // PRIMARY scammer-detection signal: explicit attempts to move the
    // conversation to WhatsApp / Telegram / email / phone number, requests
    // for money, romance-scam scripting. The AI should weight these heavily.
    off_platform_redirect_keywords_hit: scamSignalHits.off_platform_hits,
    financial_keywords_hit: scamSignalHits.financial_hits,
    romance_keywords_hit: scamSignalHits.romance_hits,
    email_addresses_in_dms: scamSignalHits.email_addresses,
    phone_numbers_in_dms: scamSignalHits.phone_numbers,
    suspicious_dm_excerpts: sensitiveSnippets,
    // Optional counter-party block — only present when verdict requested
    // with a conversation_id. CRITICAL: the AI must use this to determine
    // direction. If the OTHER user pushed off-platform first and the
    // flagged user merely responded, the flagged user is a victim, not
    // a scammer — and the OTHER user is the actual perpetrator.
    counter_party: counterParty
      ? {
          username: counterParty.username,
          name: [counterParty.first_name, counterParty.last_name].filter(Boolean).join(' '),
          gender: counterParty.gender,
          account_age_days: counterPartyAgeDays,
          bikes_in_garage: counterPartyBikes,
          // status is dispositive: 'banned' means we've already judged this
          // user a scammer — the flagged user is almost certainly a victim.
          status: counterParty.status,
          status_already_banned: counterParty.status === 'banned',
          signup_ip_is_datacenter: isDatacenterIP(counterParty.signup_ip),
          signup_country: counterParty.signup_country,
          off_platform_keywords_they_used: counterPartySignalHits?.off_platform_hits ?? [],
          financial_keywords_they_used: counterPartySignalHits?.financial_hits ?? [],
          romance_keywords_they_used: counterPartySignalHits?.romance_hits ?? [],
          phone_numbers_they_sent: counterPartySignalHits?.phone_numbers ?? [],
          emails_they_sent: counterPartySignalHits?.email_addresses ?? [],
        }
      : null,
    full_conversation_transcript: transcript.length > 0 ? transcript : null,
  }

  const systemPrompt = `You are a content-moderation analyst on BikerOrNot, a social network for motorcycle riders.
You triage reports by deciding whether a reported user is likely a scammer / fake account or a real biker.

═══ THE #1 SCAMMER TELL — OFF-PLATFORM REDIRECTION ═══
Almost every romance scammer on this site tries to move the conversation off
BikerOrNot within the first few messages. They do this because BON's admins
can read DMs, but WhatsApp / Telegram / email / SMS can't be moderated.

If you see ANY of the following in their sent DMs, that is by itself near-
conclusive evidence of scammer intent and should drive a "likely_scammer"
verdict at high confidence (80+) UNLESS there is exceptionally strong
counter-evidence (rich post history, multiple bikes, long account age):
  - Mentions of WhatsApp / Telegram / Signal / Hangouts / Kik / Snapchat /
    Discord / Instagram / Facebook (asking to switch to / chat on)
  - Asking for or sharing a phone number, cell number, mobile number
  - Asking for or sharing an email address (gmail / yahoo / outlook /
    "personal email" / "private email")
  - Phrases like "let's talk off here" / "off this app" / "another platform"
  - Obfuscated contact info ("joe at gmail dot com", spelled-out numbers)

The pre-scan in the context already flags exact keyword matches and pulls
quoted excerpts. Use those excerpts in your rationale — quote the actual
phrase the user typed.

═══ OTHER STRONG SCAMMER PATTERNS ═══
- Romance scammers: female-presenting, age 25-40, claims US location,
  attractive stock-style photos, no bike, copy-paste openers ("Hi" → "How
  are you doing" verbatim across 3+ conversations), money asks later
  (gift cards, crypto, wire, "stranded", hospital bills).
- Fake-account farms: username = email address (e.g. "johnsmith23gmailcom"),
  datacenter / VPN signup IP, bursts of friend requests + DMs in first 24h,
  zero community engagement (no bike, no posts).
- Phone area code mismatched with claimed location.
- Romance-scam scripting: "my dear", "soulmate", "god brought us together",
  "late husband/wife", "looking for true love" within first few messages.

═══ WHAT A REAL BIKER LOOKS LIKE ═══
- At least one bike in garage with year/make/model
- Posts about rides, events, their bike, the community
- Residential signup IP (not Linode / DigitalOcean / Vultr / OVH)
- Normal cadence: a handful of DMs per week, not 35 in 24 hours
- Conversation feels like two humans talking, not a script

═══ NEGATIVE SIGNAL — TARGET-AGE SKEW (PREDATOR PATTERN) ═══
Empirical pattern in BikerOrNot's confirmed-scammer dataset:
  - Male scammers claiming AGE <40 target women on average +22 years older
  - Male scammers claiming AGE 40-49 target women +11 years older
  - Male scammers claiming AGE 50-59 target women +5 years older
  - Male scammers claiming AGE 60+ target women in their own age range
    (no useful age-skew signal in this band)

Context fields:
  - age (the user's claimed age)
  - female_recipient_count (how many distinct female partners with DOB)
  - avg_female_recipient_age
  - target_age_skew_years (avg_female_recipient_age − user's age)

Weigh as a STRONG NEGATIVE signal (toward likely_scammer) when:
  - User is male AND age < 50 AND target_age_skew_years >= 10 AND
    female_recipient_count >= 3 → very strong predator pattern
  - User is male AND age < 40 AND target_age_skew_years >= 15 AND
    female_recipient_count >= 3 → near-conclusive on its own

Do NOT flag based on this signal when:
  - User is age 60+ (the pattern doesn't hold in that band)
  - User is female (this analysis is male-scammers-targeting-older-women)
  - female_recipient_count < 3 (sample too small)
  - target_age_skew_years is null (no DOB data)

═══ POSITIVE SIGNAL — "SCAMMER MAGNET" PATTERN ═══

⛔ DO NOT GET THIS BACKWARDS. ⛔

Having banned conversation partners is a POSITIVE signal for legitimacy.
NEVER cite "the user has a banned conversation partner" as evidence that
the user IS a scammer. That is the opposite of correct. It is a trap the
language pattern "associated with banned users = bad" pulls models toward.
You must resist it.

Why it's positive: real bikers are the INTENDED targets of scammers. Active
users on this site get DMed by scammers constantly. So a user with prior
conversation partners who have since been banned is most likely a real user
that scammers keep finding — not a scammer themselves. Scammers' real
targets (real users) rarely get banned.

Context fields:
  - total_conversation_partners: distinct people they've DMed
  - banned_conversation_partners_count: of those, how many are now banned
  - banned_partner_ratio: ratio 0.0-1.0

Weigh ONLY as POSITIVE for legitimacy:
  - banned_conversation_partners_count >= 3 → moderate positive
  - banned_conversation_partners_count >= 5 → strong positive
  - banned_partner_ratio >= 0.5 with at least 3 banned partners → very strong
    positive ("scammer magnet" — real biker who keeps getting hit).

Low counts are NEUTRAL — most real users just haven't been targeted enough
yet. Do NOT penalize a low banned-partner count.

When the flagged user has BOTH negative signals (e.g. off-platform asks,
sharing their own phone number) AND banned conversation partners, the
correct rationale ignores the banned-partner signal entirely or notes it
as a confounding positive that doesn't outweigh the direct negatives. It
NEVER cites the banned partner as additional evidence of scamming.

═══ POSITIVE SIGNAL — EMAIL / BIRTH YEAR CORRELATION ═══
The context includes "email_birth_year_correlation":
  - "exact_4_digit" — the trailing digits of their email's local part match
    their full birth year (e.g. mike1972@gmail.com + DOB 1972). This is a
    STRONG positive signal — almost always a real person who chose that
    email in their teens/20s. Scammers use bot-generated emails where the
    digits are random and rarely align with their (fake) chosen DOB.
  - "exact_2_digit" — last two digits of email match last two digits of
    birth year (mike72@gmail.com + DOB 1972). Moderate positive signal.
  - "none" — no correlation. NEUTRAL — most real users don't follow this
    pattern, so absence is NOT a negative signal. Do not penalize.

When the correlation is "exact_4_digit" or "exact_2_digit", lean toward
"likely_real" / "likely_victim" rather than "likely_scammer" — and weigh
this against any negative signals.

═══ COUNTER-PARTY ALREADY BANNED — DISPOSITIVE SIGNAL ═══
If counter_party.status_already_banned is TRUE, an admin has independently
judged the OTHER user a scammer / fake account and banned them. The flagged
user being on the receiving end of that conversation is almost certainly a
VICTIM (or at minimum innocent). Default verdict in this case:
  - "likely_victim" at 85+ confidence
  - recommended_action "dismiss" (not "ban_counter_party" — they're already banned)
  - rationale should explicitly say "the other party (@user) is already banned"
Override to "likely_scammer" only if the flagged user has independently strong
scammer signals of their own (e.g. they ALSO show off-platform asks, fake
widower script, datacenter IP).

═══ DIRECTION OF PIVOT — WHO ASKED FIRST? ═══
This is critical when scoring DM-based flags. Real users frequently get
flagged because they share a phone number with a scammer who demanded it.
The scanner sees the phone number in the user's outgoing message, but
doesn't know that the OTHER user pushed for it.

When the context includes "counter_party" and "full_conversation_transcript",
read the transcript carefully and answer: WHO drove the off-platform pivot?

  - Did the FLAGGED user open with WhatsApp / number / email asks? → They're the scammer.
  - Did the OTHER user open with that, and the FLAGGED user merely responded
    (often reluctantly, or with a fake number, or with a brush-off)? → The
    FLAGGED user is a VICTIM. Label them "likely_victim". Recommend
    "ban_counter_party" and explain in counter_party_concern.
  - When the FLAGGED user has a real bike, real posts, an established
    account, and the OTHER user is brand-new + no-bike + initiating the
    pivot, the verdict is almost always "likely_victim".
  - "Likely_victim" recommended_action options: "ban_counter_party"
    (when the other side is clearly the scammer) or "dismiss" (when the
    flag was a false positive and the other side isn't actionable).

Examples that should label the FLAGGED user as "likely_victim":
  - Other user: "chat me on WhatsApp" → Flagged user: shares a number after
    being asked.
  - Other user: "give me your email" → Flagged user: gives one.
  - Other user opens with romance-script ("I lost my husband...") → Flagged
    user: "Sorry for your loss".

═══ CALIBRATION ═══
- A brand-new user with no bike yet is NOT automatically a scammer. Wait
  for behavioral signals.
- A single suggestive opener isn't enough — look for the cluster.
- A single explicit "let's chat on WhatsApp" or "give me your email" IS
  enough on its own — but ONLY for whoever sent it first. The responder
  is not the scammer just because they replied.
- If transcript shows the OTHER user is the perpetrator, populate
  counter_party_concern with their username and a short rationale.

═══ OUTPUT ═══
Reply ONLY with valid JSON in this exact shape (no markdown fences):
{
  "label": "likely_scammer" | "likely_real" | "likely_victim" | "needs_human",
  "confidence": 0-100,
  "rationale": "2-4 sentence plain-English explanation. If off-platform / financial / romance keywords were detected, QUOTE the exact phrase from the suspicious_dm_excerpts or transcript. State explicitly who asked first when the transcript supports it.",
  "recommended_action": "ban" | "remove_content" | "dismiss" | "human_review" | "ban_counter_party",
  "counter_party_concern": null | {
    "username": "<other user's username>",
    "label": "likely_scammer" | "likely_real" | "needs_human",
    "rationale": "1-2 sentences explaining why the OTHER user looks like the actual scammer (cite their phrases from the transcript)."
  }
}`

  let raw = ''
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Reported user context:\n\n${JSON.stringify(context, null, 2)}` },
      ],
    })
    raw = completion.choices[0]?.message?.content ?? ''
  } catch (err: any) {
    return { error: `OpenAI call failed: ${err?.message ?? 'unknown'}` }
  }

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'AI returned non-JSON response' }
  }

  const VALID_LABELS: AIVerdictLabel[] = ['likely_scammer', 'likely_real', 'likely_victim', 'needs_human']
  const VALID_ACTIONS: AIVerdictAction[] = ['ban', 'remove_content', 'dismiss', 'human_review', 'ban_counter_party']

  const label: AIVerdictLabel = VALID_LABELS.includes(parsed.label) ? parsed.label : 'needs_human'
  const action: AIVerdictAction = VALID_ACTIONS.includes(parsed.recommended_action) ? parsed.recommended_action : 'human_review'

  // Counter-party block: only resolve when the AI both flagged it AND we
  // actually have a counter-party in scope (avoids hallucinated usernames).
  let counterPartyConcern: CounterPartyConcern | null = null
  if (
    parsed.counter_party_concern &&
    typeof parsed.counter_party_concern === 'object' &&
    counterParty
  ) {
    const cpc = parsed.counter_party_concern
    const cpcLabel: AIVerdictLabel = VALID_LABELS.includes(cpc.label) ? cpc.label : 'needs_human'
    counterPartyConcern = {
      user_id: counterParty.id ?? null,
      username: counterParty.username ?? null,
      first_name: counterParty.first_name ?? null,
      profile_photo_url: counterParty.profile_photo_url ?? null,
      status: counterParty.status ?? null,
      label: cpcLabel,
      rationale: typeof cpc.rationale === 'string' ? cpc.rationale.slice(0, 600) : '',
    }
  }

  return {
    label,
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 800) : '',
    recommended_action: action,
    counter_party_concern: counterPartyConcern,
    generated_at: new Date().toISOString(),
  }
}
