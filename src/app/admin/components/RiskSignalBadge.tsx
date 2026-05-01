'use client'

import { RISK_SIGNAL_META, type RiskSignal } from '@/lib/risk-signals-meta'

export function RiskSignalBadge({ signal }: { signal: RiskSignal }) {
  const meta = RISK_SIGNAL_META[signal]
  if (!meta) return null
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${meta.tone}`}
      title={meta.tooltip}
    >
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  )
}

export function RiskSignalBadges({ signals }: { signals: RiskSignal[] | undefined | null }) {
  if (!signals || signals.length === 0) return null
  return (
    <>
      {signals.map((s) => <RiskSignalBadge key={s} signal={s} />)}
    </>
  )
}
