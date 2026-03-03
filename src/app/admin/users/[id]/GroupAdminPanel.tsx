'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  suspendGroup,
  reinstateGroup,
  getGroupMembersForTransfer,
  transferGroupOwnership,
  type AdminGroupRow,
  type GroupMemberOption,
} from '@/app/actions/admin'

function StatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return status === 'suspended' ? (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
      Suspended
    </span>
  ) : (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
      Active
    </span>
  )
}

function GroupRow({
  group,
  creatorId,
  onUpdate,
}: {
  group: AdminGroupRow
  creatorId: string
  onUpdate: (updated: AdminGroupRow) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'suspending' | 'transferring'>('idle')
  const [suspendReason, setSuspendReason] = useState('')
  const [members, setMembers] = useState<GroupMemberOption[]>([])
  const [selectedMember, setSelectedMember] = useState('')
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSuspend() {
    if (!suspendReason.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        await suspendGroup(group.id, suspendReason.trim())
        onUpdate({ ...group, status: 'suspended', suspended_reason: suspendReason.trim() })
        setMode('idle')
        setSuspendReason('')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to suspend group')
      }
    })
  }

  function handleReinstate() {
    setError(null)
    startTransition(async () => {
      try {
        await reinstateGroup(group.id)
        onUpdate({ ...group, status: 'active', suspended_reason: null })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to reinstate group')
      }
    })
  }

  async function openTransfer() {
    setError(null)
    setLoadingMembers(true)
    setMode('transferring')
    try {
      const opts = await getGroupMembersForTransfer(group.id, creatorId)
      setMembers(opts)
      if (opts.length > 0) setSelectedMember(opts[0].user_id)
    } catch {
      setError('Failed to load members')
    } finally {
      setLoadingMembers(false)
    }
  }

  function handleTransfer() {
    if (!selectedMember) return
    setError(null)
    startTransition(async () => {
      try {
        await transferGroupOwnership(group.id, selectedMember)
        onUpdate({ ...group, status: 'active', suspended_reason: null })
        setMode('idle')
        setMembers([])
        setSelectedMember('')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to transfer ownership')
      }
    })
  }

  return (
    <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Group info row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/groups/${group.slug}`}
              target="_blank"
              className="text-sm font-semibold text-white hover:text-orange-400 transition-colors"
            >
              {group.name}
            </Link>
            <StatusBadge status={group.status} />
          </div>
          <p className="text-zinc-500 text-xs mt-0.5">
            {group.privacy === 'private' ? '🔒 Private' : '🌐 Public'} · {group.member_count} member{group.member_count !== 1 ? 's' : ''}
          </p>
          {group.suspended_reason && (
            <p className="text-red-400/70 text-xs mt-1 italic">Reason: {group.suspended_reason}</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {mode === 'idle' && (
        <div className="flex gap-2 flex-wrap">
          {group.status === 'active' ? (
            <button
              onClick={() => setMode('suspending')}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 transition-colors disabled:opacity-50"
            >
              Suspend Group
            </button>
          ) : (
            <button
              onClick={handleReinstate}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Reinstating…' : 'Reinstate'}
            </button>
          )}
          <button
            onClick={openTransfer}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition-colors disabled:opacity-50"
          >
            Transfer Ownership
          </button>
        </div>
      )}

      {/* Suspend form */}
      {mode === 'suspending' && (
        <div className="space-y-2">
          <input
            type="text"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Reason for suspension…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSuspend}
              disabled={!suspendReason.trim() || isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
            >
              {isPending ? 'Suspending…' : 'Confirm Suspend'}
            </button>
            <button
              onClick={() => { setMode('idle'); setSuspendReason('') }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Transfer form */}
      {mode === 'transferring' && (
        <div className="space-y-2">
          {loadingMembers ? (
            <p className="text-zinc-500 text-xs">Loading members…</p>
          ) : members.length === 0 ? (
            <p className="text-zinc-500 text-xs">No other members to transfer to.</p>
          ) : (
            <>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.first_name} {m.last_name}{m.username ? ` (@${m.username})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-zinc-600 text-xs">
                This will transfer ownership and reinstate the group.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleTransfer}
                  disabled={!selectedMember || isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Transferring…' : 'Transfer & Reinstate'}
                </button>
                <button
                  onClick={() => { setMode('idle'); setMembers([]) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}

export default function GroupAdminPanel({
  groups,
  creatorId,
}: {
  groups: AdminGroupRow[]
  creatorId: string
}) {
  const [groupList, setGroupList] = useState(groups)

  function handleUpdate(updated: AdminGroupRow) {
    setGroupList((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
  }

  if (groupList.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-white font-semibold text-sm">Groups Created</h2>
        </div>
        <p className="text-center text-zinc-600 text-sm py-8">No groups created</p>
      </div>
    )
  }

  const suspendedCount = groupList.filter((g) => g.status === 'suspended').length

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">Groups Created</h2>
        <div className="flex items-center gap-2">
          {suspendedCount > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">
              {suspendedCount} suspended
            </span>
          )}
          <span className="text-zinc-600 text-xs">{groupList.length} total</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {groupList.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            creatorId={creatorId}
            onUpdate={handleUpdate}
          />
        ))}
      </div>
    </div>
  )
}
