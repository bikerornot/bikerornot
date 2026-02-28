'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, RELATIONSHIP_OPTIONS, GENDER_OPTIONS } from '@/lib/supabase/types'
import { saveProfileSettings, saveEmailPreferences } from './actions'
import { deactivateAccount, scheduleAccountDeletion } from '@/app/actions/account'

interface Props {
  profile: Profile
}

const inputClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm'

export default function SettingsForm({ profile }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Danger zone
  const [dangerPanel, setDangerPanel] = useState<'deactivate' | 'delete' | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [dangerPending, startDangerTransition] = useTransition()

  const [emailFriendRequests, setEmailFriendRequests] = useState(profile.email_friend_requests ?? true)
  const [emailFriendAccepted, setEmailFriendAccepted] = useState(profile.email_friend_accepted ?? true)

  const [bio, setBio] = useState(profile.bio ?? '')
  const [location, setLocation] = useState(profile.location ?? '')
  const [zipCode, setZipCode] = useState(profile.zip_code ?? '')
  const [gender, setGender] = useState(profile.gender ?? '')
  const [relationshipStatus, setRelationshipStatus] = useState(
    profile.relationship_status ?? ''
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      await saveProfileSettings(
        {
          bio: bio.trim() || null,
          location: location.trim() || null,
          zip_code: zipCode.trim(),
          gender: gender || null,
          relationship_status: relationshipStatus || null,
          riding_style: null,
        },
        [],
        []
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <form onSubmit={handleSave} className="space-y-6">
      {/* Username (read-only) */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Username</label>
        <div className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-zinc-400 text-sm cursor-not-allowed">
          @{profile.username}
        </div>
        <p className="text-zinc-600 text-xs mt-1">Username cannot be changed.</p>
      </div>


      {/* Bio */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-zinc-300">Bio</label>
          <span className="text-xs text-zinc-500">{bio.length}/300</span>
        </div>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 300))}
          maxLength={300}
          rows={3}
          placeholder="Tell other riders about yourself…"
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Location
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, State"
          className={inputClass}
        />
      </div>

      {/* Zip code */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Zip / Postal code
        </label>
        <input
          type="text"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          placeholder="90210"
          className={inputClass}
        />
      </div>

      {/* Gender */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Gender</label>
        <div className="grid grid-cols-2 gap-2">
          {GENDER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                gender === opt.value
                  ? 'border-orange-500 bg-orange-500/10 text-white'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <input
                type="radio"
                name="gender"
                value={opt.value}
                checked={gender === opt.value}
                onChange={(e) => setGender(e.target.value)}
                className="sr-only"
              />
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Relationship status */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Relationship status
        </label>
        <div className="space-y-2">
          {RELATIONSHIP_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                relationshipStatus === opt.value
                  ? 'border-orange-500 bg-orange-500/10 text-white'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <input
                type="radio"
                name="relationshipStatus"
                value={opt.value}
                checked={relationshipStatus === opt.value}
                onChange={(e) => setRelationshipStatus(e.target.value)}
                className="sr-only"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save changes'}
      </button>
    </form>

    {/* ── Email Notifications ─────────────────────────────────────── */}
    <div className="mt-10 pt-8 border-t border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-1">Email Notifications</h2>
      <p className="text-zinc-500 text-xs mb-5">Choose which emails you receive from BikerOrNot.</p>
      <div className="space-y-3">
        {([
          { key: 'email_friend_requests' as const, label: 'Friend request received', value: emailFriendRequests, set: setEmailFriendRequests },
          { key: 'email_friend_accepted' as const, label: 'Friend request accepted', value: emailFriendAccepted, set: setEmailFriendAccepted },
        ]).map(({ key, label, value, set }) => (
          <div key={key} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
            <span className="text-sm text-zinc-300">{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={value}
              onClick={async () => {
                const next = !value
                set(next)
                await saveEmailPreferences({
                  email_friend_requests: key === 'email_friend_requests' ? next : emailFriendRequests,
                  email_friend_accepted: key === 'email_friend_accepted' ? next : emailFriendAccepted,
                })
              }}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${value ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        ))}
      </div>
    </div>

    {/* ── Danger Zone ────────────────────────────────────────────── */}
    <div className="mt-10 pt-8 border-t border-zinc-800">
      <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-1">Danger Zone</h2>
      <p className="text-zinc-500 text-xs mb-6">
        These actions affect your account permanently. Please read carefully before proceeding.
      </p>

      {/* Deactivate */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white text-sm font-medium">Deactivate account</p>
            <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
              Your profile and posts will be hidden from other users. Log back in at any time to reactivate instantly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDangerPanel(dangerPanel === 'deactivate' ? null : 'deactivate')}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Deactivate
          </button>
        </div>

        {dangerPanel === 'deactivate' && (
          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
            <div className="bg-zinc-800 rounded-lg p-3 text-xs text-zinc-400 leading-relaxed space-y-1.5">
              <p>✓ Your profile disappears from search and browse immediately.</p>
              <p>✓ Your posts and photos are hidden but not deleted.</p>
              <p>✓ All your data is preserved — just log back in to reactivate.</p>
            </div>
            <button
              type="button"
              disabled={dangerPending}
              onClick={() => startDangerTransition(() => deactivateAccount())}
              className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {dangerPending ? 'Deactivating…' : 'Yes, deactivate my account'}
            </button>
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="bg-zinc-900 border border-red-900/40 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-red-400 text-sm font-medium">Delete account</p>
            <p className="text-zinc-500 text-xs mt-0.5 leading-relaxed">
              Permanently delete your account and all your data after a 30-day grace period.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDangerPanel(dangerPanel === 'delete' ? null : 'delete')}
            className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-900/60 text-red-400 hover:border-red-500/60 hover:text-red-300 transition-colors"
          >
            Delete
          </button>
        </div>

        {dangerPanel === 'delete' && (
          <div className="mt-4 pt-4 border-t border-red-900/30 space-y-4">
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-xs text-zinc-400 leading-relaxed space-y-1.5">
              <p className="text-red-300 font-semibold">This cannot be undone after 30 days.</p>
              <p>✗ Your profile, posts, photos, and messages will be permanently deleted.</p>
              <p>✗ Your username will be released and may be claimed by someone else.</p>
              <p>✓ You have 30 days to change your mind by logging back in.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                Type your username <span className="text-white font-mono">@{profile.username}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={profile.username ?? ''}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm font-mono"
              />
            </div>
            <button
              type="button"
              disabled={dangerPending || deleteConfirm !== profile.username}
              onClick={() => startDangerTransition(() => scheduleAccountDeletion())}
              className="w-full bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold py-2.5 rounded-lg transition-colors text-sm"
            >
              {dangerPending ? 'Scheduling…' : 'Schedule account deletion'}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
