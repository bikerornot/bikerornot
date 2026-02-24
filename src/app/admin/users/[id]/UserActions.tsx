'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { suspendUser, banUser, reinstateUser, setUserRole } from '@/app/actions/admin'

const SUSPEND_DURATIONS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Permanent', days: null },
]

const ROLES = ['user', 'moderator', 'admin', 'super_admin'] as const

interface Props {
  userId: string
  currentStatus: 'active' | 'suspended' | 'banned'
  currentRole: string
  isSuperAdmin: boolean
}

export default function UserActions({ userId, currentStatus, currentRole, isSuperAdmin }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [modal, setModal] = useState<'suspend' | 'ban' | 'reinstate' | 'role' | null>(null)
  const [suspendDays, setSuspendDays] = useState<number | null>(7)
  const [suspendReason, setSuspendReason] = useState('')
  const [banReason, setBanReason] = useState('')
  const [selectedRole, setSelectedRole] = useState(currentRole)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setModal(null)
      startTransition(() => router.refresh())
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Moderation Actions</h2>

        <div className="flex flex-wrap gap-2">
          {currentStatus === 'active' && (
            <>
              <button
                onClick={() => setModal('suspend')}
                className="bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-orange-500/30"
              >
                Suspend
              </button>
              <button
                onClick={() => setModal('ban')}
                className="bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-red-500/30"
              >
                Ban
              </button>
            </>
          )}
          {currentStatus === 'suspended' && (
            <>
              <button
                onClick={() => setModal('reinstate')}
                className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-emerald-500/30"
              >
                Lift Suspension
              </button>
              <button
                onClick={() => setModal('ban')}
                className="bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-red-500/30"
              >
                Ban Instead
              </button>
            </>
          )}
          {currentStatus === 'banned' && (
            <button
              onClick={() => setModal('reinstate')}
              className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-emerald-500/30"
            >
              Unban
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => { setSelectedRole(currentRole); setModal('role') }}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
            >
              Change Role
            </button>
          )}
        </div>
      </div>

      {/* Suspend modal */}
      {modal === 'suspend' && (
        <Modal title="Suspend User" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">Duration</p>
              <div className="flex flex-wrap gap-2">
                {SUSPEND_DURATIONS.map((d) => (
                  <button
                    key={String(d.days)}
                    onClick={() => setSuspendDays(d.days)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      suspendDays === d.days
                        ? 'bg-orange-500 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-2">
                Reason <span className="text-zinc-600 font-normal normal-case">(required)</span>
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Why is this user being suspended?"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!suspendReason.trim()) { setError('Reason is required'); return }
                  run(() => suspendUser(userId, suspendReason.trim(), suspendDays))
                }}
                disabled={busy}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {busy ? 'Suspending…' : 'Suspend User'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Ban modal */}
      {modal === 'ban' && (
        <Modal title="Ban User" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              This will permanently ban the user. They will not be able to log in.
            </p>
            <div>
              <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-2">
                Reason <span className="text-zinc-600 font-normal normal-case">(required)</span>
              </label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Why is this user being banned?"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-500 transition-colors resize-none"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!banReason.trim()) { setError('Reason is required'); return }
                  run(() => banUser(userId, banReason.trim()))
                }}
                disabled={busy}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {busy ? 'Banning…' : 'Ban User'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reinstate modal */}
      {modal === 'reinstate' && (
        <Modal title="Reinstate User" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <p className="text-zinc-400 text-sm">
              This will restore the user's access and set their status back to active.
            </p>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors">
                Cancel
              </button>
              <button
                onClick={() => run(() => reinstateUser(userId))}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {busy ? 'Reinstating…' : 'Reinstate User'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Role modal */}
      {modal === 'role' && (
        <Modal title="Change Role" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRole(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedRole === r
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors">
                Cancel
              </button>
              <button
                onClick={() => run(() => setUserRole(userId, selectedRole as any))}
                disabled={busy || selectedRole === currentRole}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {busy ? 'Saving…' : 'Save Role'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-lg leading-none">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
