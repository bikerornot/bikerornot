// Client-safe types + presentation metadata for risk signals. Kept separate
// from `risk-signals.ts` (which is `server-only`) so client components like
// the Reports / AI Flags queues can import the badge styling.

export type RiskSignal =
  | 'new_account'    // signed up <7 days ago
  | 'no_bike'        // 0 bikes in garage
  | 'datacenter_ip'  // signup IP is in a known cloud / VPS / VPN range
  | 'burst_dms'      // >10 DMs sent in their first 24 hours
  | 'robotic_opener' // 3+ different recipients got the same first message

export interface RiskSignalMeta {
  label: string
  emoji: string
  tone: string       // tailwind classes for the badge
  tooltip: string
}

export const RISK_SIGNAL_META: Record<RiskSignal, RiskSignalMeta> = {
  new_account:    { label: 'New',           emoji: '🆕', tone: 'bg-blue-500/20 text-blue-300 border-blue-500/30',     tooltip: 'Account created less than 7 days ago' },
  no_bike:        { label: 'No bike',       emoji: '🏍️', tone: 'bg-amber-500/20 text-amber-300 border-amber-500/30',  tooltip: 'No bikes in garage — strong signal for fake / scammer accounts on a biker site' },
  datacenter_ip:  { label: 'VPN/DC IP',     emoji: '🚫', tone: 'bg-red-500/20 text-red-300 border-red-500/30',         tooltip: 'Signed up from a known cloud / VPS / VPN IP range — real users sign up from residential ISPs' },
  burst_dms:      { label: 'Burst DMs',     emoji: '💬', tone: 'bg-red-500/20 text-red-300 border-red-500/30',         tooltip: 'Sent more than 10 DMs within 24 hours of signup — spray-and-pray pattern' },
  robotic_opener: { label: 'Copy-paste',    emoji: '🔁', tone: 'bg-red-500/20 text-red-300 border-red-500/30',         tooltip: '3+ different conversations got the exact same first message' },
}
