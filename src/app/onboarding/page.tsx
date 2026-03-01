'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { RIDING_STYLES } from '@/lib/supabase/types'
import { uploadAvatar, completeOnboarding } from './actions'

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/
const CURRENT_YEAR = new Date().getFullYear()

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

interface BikeRow {
  year: string
  make: string
  model: string
}

// ─── Progress Indicator ───────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((step) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              step < current
                ? 'bg-orange-500 text-white'
                : step === current
                ? 'bg-orange-500 text-white ring-4 ring-orange-500/30'
                : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            {step < current ? '✓' : step}
          </div>
          {step < 3 && <div className={`w-12 h-0.5 ${step < current ? 'bg-orange-500' : 'bg-zinc-700'}`} />}
        </div>
      ))}
    </div>
  )
}

// ─── Step 1: Username ─────────────────────────────────────────────────────────
function StepUsername({
  username,
  setUsername,
  status,
  setStatus,
}: {
  username: string
  setUsername: (v: string) => void
  status: UsernameStatus
  setStatus: (s: UsernameStatus) => void
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkUsername = useCallback(async (value: string) => {
    if (!USERNAME_REGEX.test(value)) {
      setStatus('invalid')
      return
    }
    setStatus('checking')
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', value)
      .maybeSingle()
    setStatus(data ? 'taken' : 'available')
  }, [setStatus])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsername(value)
    setStatus('idle')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length >= 3) {
      debounceRef.current = setTimeout(() => checkUsername(value), 600)
    }
  }

  const statusMessage = {
    idle: null,
    checking: <span className="text-zinc-400">Checking availability…</span>,
    available: <span className="text-green-400">✓ @{username} is available</span>,
    taken: <span className="text-red-400">✗ That username is taken</span>,
    invalid: username.length > 0
      ? <span className="text-red-400">✗ 3–20 chars, lowercase letters, numbers, underscores only</span>
      : null,
  }[status]

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Pick your username</h2>
      <p className="text-zinc-400 text-sm mb-6">This is how other riders will find you.</p>

      <div>
        <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-500">
          <span className="pl-3 text-zinc-500 text-sm select-none">@</span>
          <input
            type="text"
            value={username}
            onChange={handleChange}
            maxLength={20}
            autoComplete="off"
            autoCapitalize="none"
            className="flex-1 bg-transparent px-2 py-2.5 text-white placeholder-zinc-500 focus:outline-none text-sm"
            placeholder="yourhandle"
          />
        </div>
        <p className="text-zinc-500 text-xs mt-2">3–20 characters · lowercase letters, numbers, underscores</p>
        {statusMessage && <p className="text-xs mt-1">{statusMessage}</p>}
      </div>
    </div>
  )
}

// ─── Step 2: Profile Photo ────────────────────────────────────────────────────
function StepPhoto({
  photoFile,
  setPhotoFile,
  photoPreview,
  setPhotoPreview,
}: {
  photoFile: File | null
  setPhotoFile: (f: File | null) => void
  photoPreview: string | null
  setPhotoPreview: (url: string | null) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB')
      return
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Add a profile photo</h2>
      <p className="text-zinc-400 text-sm mb-6">Optional — you can always add one later.</p>

      <div className="flex flex-col items-center gap-4">
        {/* Preview */}
        <div
          onClick={() => inputRef.current?.click()}
          className="w-32 h-32 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-orange-500 transition-colors relative"
        >
          {photoPreview ? (
            <Image src={photoPreview} alt="Preview" fill className="object-cover" />
          ) : (
            <span className="text-4xl">📷</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg border border-zinc-700 transition-colors"
        >
          {photoFile ? 'Change photo' : 'Choose photo'}
        </button>

        {photoFile && (
          <button
            type="button"
            onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
            className="text-zinc-500 hover:text-zinc-300 text-xs"
          >
            Remove
          </button>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  )
}

// ─── Step 3: Bikes ────────────────────────────────────────────────────────────
function StepBikes({
  bikes,
  setBikes,
}: {
  bikes: BikeRow[]
  setBikes: React.Dispatch<React.SetStateAction<BikeRow[]>>
}) {
  function updateBike(index: number, field: keyof BikeRow, value: string) {
    setBikes((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)))
  }

  function addBike() {
    setBikes((prev) => [...prev, { year: '', make: '', model: '' }])
  }

  function removeBike(index: number) {
    setBikes((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Add your ride</h2>
      <p className="text-zinc-400 text-sm mb-6">Optional — you can add or update your garage any time from your profile.</p>

      <div className="space-y-3">
        {bikes.map((bike, index) => (
          <div key={index} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
                Bike {index + 1}
              </span>
              {bikes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBike(index)}
                  className="text-zinc-500 hover:text-red-400 text-xs transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={bike.year}
                onChange={(e) => updateBike(index, 'year', e.target.value)}
                min={1900}
                max={CURRENT_YEAR + 1}
                placeholder="Year"
                className="bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
              />
              <input
                type="text"
                value={bike.make}
                onChange={(e) => updateBike(index, 'make', e.target.value)}
                placeholder="Make"
                className="bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
              />
              <input
                type="text"
                value={bike.model}
                onChange={(e) => updateBike(index, 'model', e.target.value)}
                placeholder="Model"
                className="bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addBike}
          className="text-orange-400 hover:text-orange-300 text-sm font-medium flex items-center gap-1 transition-colors"
        >
          + Add another bike
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')

  // Step 2
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Step 3
  const [bikes, setBikes] = useState<BikeRow[]>([{ year: '', make: '', model: '' }])

  function canAdvanceStep1() {
    return usernameStatus === 'available'
  }

  function bikesAreValid() {
    // If the user added any bike rows, all fields must be filled in
    return bikes.every(
      (b) =>
        b.make.trim() &&
        b.model.trim() &&
        b.year &&
        parseInt(b.year) >= 1900 &&
        parseInt(b.year) <= CURRENT_YEAR + 1
    )
  }

  async function handleComplete(skipBikes = false) {
    if (!skipBikes && !bikesAreValid()) {
      setError('Please fill in all bike fields, or skip this step.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // Upload avatar server-side if selected
      let photoPath: string | null = null
      if (photoFile) {
        const formData = new FormData()
        formData.append('file', photoFile)
        photoPath = await uploadAvatar(formData)
      }

      // Complete onboarding via server action (bypasses client-side auth issues)
      await completeOnboarding(
        username,
        photoPath,
        skipBikes
          ? []
          : bikes
              .filter((b) => b.year && b.make.trim() && b.model.trim())
              .map((b) => ({
                year: parseInt(b.year),
                make: b.make.trim(),
                model: b.model.trim(),
              }))
      )

      if (typeof window !== 'undefined' && (window as any).fbq) {
        ;(window as any).fbq('track', 'CompleteRegistration')
      }

      router.push('/feed')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      if (message === 'USERNAME_TAKEN') {
        setError('Sorry, that username was just taken. Please go back and choose another.')
      } else {
        setError(message)
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">
            Biker<span className="text-orange-500">OrNot</span>
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Let&apos;s set up your profile</p>
        </div>

        <StepIndicator current={step} />

        <div className="bg-zinc-900 rounded-2xl p-8 shadow-2xl border border-zinc-800">
          {step === 1 && (
            <StepUsername
              username={username}
              setUsername={setUsername}
              status={usernameStatus}
              setStatus={setUsernameStatus}
            />
          )}
          {step === 2 && (
            <StepPhoto
              photoFile={photoFile}
              setPhotoFile={setPhotoFile}
              photoPreview={photoPreview}
              setPhotoPreview={setPhotoPreview}
            />
          )}
          {step === 3 && <StepBikes bikes={bikes} setBikes={setBikes} />}

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button
                type="button"
                onClick={() => { setStep((s) => s - 1); setError(null) }}
                disabled={submitting}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm border border-zinc-700"
              >
                Back
              </button>
            )}

            {step < 3 && (
              <button
                type="button"
                onClick={() => { setStep((s) => s + 1); setError(null) }}
                disabled={step === 1 && !canAdvanceStep1()}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {step === 2 && !photoFile ? 'Skip' : 'Next'}
              </button>
            )}

            {step === 3 && (
              <>
                <button
                  type="button"
                  onClick={() => handleComplete(true)}
                  disabled={submitting}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 font-semibold py-2.5 rounded-lg transition-colors text-sm border border-zinc-700"
                >
                  Skip this step
                </button>
                <button
                  type="button"
                  onClick={() => handleComplete(false)}
                  disabled={submitting || !bikesAreValid()}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  {submitting ? 'Setting up…' : 'Complete setup'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
