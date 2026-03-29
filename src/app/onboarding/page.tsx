'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { RIDING_STYLES } from '@/lib/supabase/types'
import { uploadAvatar, saveOnboardingData, finalizeOnboarding, uploadOnboardingBikePhoto } from './actions'
import BikeSelector, { BikeData } from '@/app/settings/BikeSelector'
import { compressImage } from '@/lib/compress'
import { validateUsername } from '@/lib/username-rules'
import PhoneVerifyForm from '@/app/components/PhoneVerifyForm'

const USERNAME_REGEX = /^[a-z0-9_]{4,20}$/
const CURRENT_YEAR = new Date().getFullYear()

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'blocked'

// ─── Progress Indicator ───────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
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
          {step < total && <div className={`w-12 h-0.5 ${step < current ? 'bg-orange-500' : 'bg-zinc-700'}`} />}
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

  const [blockedReason, setBlockedReason] = useState<string | null>(null)

  const checkUsername = useCallback(async (value: string) => {
    if (!USERNAME_REGEX.test(value)) {
      setStatus('invalid')
      return
    }
    const ruleError = validateUsername(value)
    if (ruleError) {
      setBlockedReason(ruleError)
      setStatus('blocked')
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
    if (value.length >= 4) {
      debounceRef.current = setTimeout(() => checkUsername(value), 600)
    }
  }

  const statusMessage = {
    idle: null,
    checking: <span className="text-zinc-400">Checking availability…</span>,
    available: <span className="text-green-400">✓ @{username} is available</span>,
    taken: <span className="text-red-400">✗ That username is taken</span>,
    invalid: username.length > 0
      ? <span className="text-red-400">✗ Must be 4–20 characters, lowercase letters, numbers, and underscores only</span>
      : null,
    blocked: <span className="text-red-400">✗ {blockedReason}</span>,
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
        <p className="text-zinc-500 text-xs mt-2">4–20 characters · lowercase letters, numbers, underscores</p>
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    try {
      const compressed = await compressImage(file, 0.5, 800)
      if (compressed.size > 3 * 1024 * 1024) {
        setError('Image is too large. Please choose a smaller file.')
        return
      }
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhotoFile(compressed)
      setPhotoPreview(URL.createObjectURL(compressed))
    } catch {
      setError('Failed to process image')
    }
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
            className="text-zinc-500 hover:text-zinc-300 text-sm"
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
  bikePhotos,
  setBikePhotos,
}: {
  bikes: BikeData[]
  setBikes: React.Dispatch<React.SetStateAction<BikeData[]>>
  bikePhotos: (File | null)[]
  setBikePhotos: React.Dispatch<React.SetStateAction<(File | null)[]>>
}) {
  const [photoPreviews, setPhotoPreviews] = useState<(string | null)[]>(bikes.map(() => null))
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  function updateBike(index: number, val: BikeData) {
    setBikes((prev) => prev.map((b, i) => (i === index ? val : b)))
  }

  function addBike() {
    setBikes((prev) => [...prev, { year: '', make: '', model: '' }])
    setBikePhotos((prev) => [...prev, null])
    setPhotoPreviews((prev) => [...prev, null])
  }

  function removeBike(index: number) {
    // Revoke preview URL
    if (photoPreviews[index]) URL.revokeObjectURL(photoPreviews[index]!)
    setBikes((prev) => prev.filter((_, i) => i !== index))
    setBikePhotos((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  async function handlePhotoSelect(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError(null)
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const compressed = await compressImage(file, 1, 1920)
      if (compressed.size > 5 * 1024 * 1024) {
        setPhotoError('Image is too large. Please choose a smaller file.')
        return
      }
      // Revoke old preview
      if (photoPreviews[index]) URL.revokeObjectURL(photoPreviews[index]!)
      setBikePhotos((prev) => prev.map((p, i) => (i === index ? compressed : p)))
      setPhotoPreviews((prev) => prev.map((p, i) => (i === index ? URL.createObjectURL(compressed) : p)))
    } catch {
      setPhotoError('Failed to process image')
    }
  }

  function removePhoto(index: number) {
    if (photoPreviews[index]) URL.revokeObjectURL(photoPreviews[index]!)
    setBikePhotos((prev) => prev.map((p, i) => (i === index ? null : p)))
    setPhotoPreviews((prev) => prev.map((p, i) => (i === index ? null : p)))
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Add your ride</h2>
      <p className="text-zinc-400 text-sm mb-6">Optional — you can add or update your garage any time from your profile.</p>

      <div className="space-y-3">
        {bikes.map((bike, index) => (
          <div key={index} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-400 text-sm font-medium uppercase tracking-wider">
                Bike {index + 1}
              </span>
              {bikes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBike(index)}
                  className="text-zinc-500 hover:text-red-400 text-sm transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <BikeSelector value={bike} onChange={(val) => updateBike(index, val)} />

            {/* Photo upload area */}
            <div className="mt-3 pt-3 border-t border-zinc-700/50">
              {photoPreviews[index] ? (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-700 flex-shrink-0 relative">
                    <img
                      src={photoPreviews[index]!}
                      alt="Bike preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[index]?.click()}
                      className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors text-left"
                    >
                      Change photo
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors text-left"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[index]?.click()}
                  className="flex items-center gap-2 text-zinc-500 hover:text-orange-400 text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                  Add a photo (optional)
                </button>
              )}
              <input
                ref={(el) => { fileInputRefs.current[index] = el }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handlePhotoSelect(index, e)}
              />
            </div>
          </div>
        ))}

        {photoError && <p className="text-red-400 text-xs">{photoError}</p>}

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
  const [phoneRequired, setPhoneRequired] = useState(false)

  // Step 1
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')

  // Step 2
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Step 3
  const [bikes, setBikes] = useState<BikeData[]>([{ year: '', make: '', model: '' }])
  const [bikePhotos, setBikePhotos] = useState<(File | null)[]>([null])

  // Detect if phone verification will be required (female under 40)
  // If they already completed steps 1-3 (have username + phone_verification_required), skip to step 4
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const gender = user.user_metadata?.gender as string | undefined
      const dob = user.user_metadata?.date_of_birth as string | undefined
      if (gender === 'female' && dob) {
        const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000))
        if (age < 40) {
          setPhoneRequired(true)
          // Check if they already completed steps 1-3 (returning to finish phone verification)
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, phone_verification_required')
            .eq('id', user.id)
            .single()
          if (profile?.username && profile?.phone_verification_required) {
            setStep(4)
          }
        }
      }
    })
  }, [])

  const totalSteps = phoneRequired ? 4 : 3

  function canAdvanceStep1() {
    return usernameStatus === 'available'
  }

  function bikesAreValid() {
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

      const refUrl = localStorage.getItem('signup_ref_url') ?? null
      const validBikes = skipBikes
        ? []
        : bikes
            .filter((b) => b.year && b.make.trim() && b.model.trim())
            .map((b) => ({
              year: parseInt(b.year),
              make: b.make.trim(),
              model: b.model.trim(),
            }))
      const result = await saveOnboardingData(username, photoPath, validBikes, refUrl)
      localStorage.removeItem('signup_ref_url')

      // Upload bike photos (best-effort — don't block completion)
      if (result.bikeIds.length > 0 && !skipBikes) {
        const uploadPromises = result.bikeIds.map(async (bikeId, i) => {
          const photo = bikePhotos[i]
          if (!photo) return
          try {
            const formData = new FormData()
            formData.append('file', photo)
            await uploadOnboardingBikePhoto(bikeId, formData)
          } catch {
            // Photo upload failure shouldn't block onboarding
          }
        })
        await Promise.all(uploadPromises)
      }

      if (result.phoneRequired) {
        // Advance to step 4 for phone verification
        setStep(4)
        setSubmitting(false)
      } else {
        // Onboarding complete — profile already activated
        if (typeof window !== 'undefined' && (window as any).fbq) {
          ;(window as any).fbq('track', 'CompleteRegistration')
        }
        router.push('/feed')
      }
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

  async function handlePhoneVerified() {
    try {
      await finalizeOnboarding()
      if (typeof window !== 'undefined' && (window as any).fbq) {
        ;(window as any).fbq('track', 'CompleteRegistration')
      }
      router.push('/feed')
    } catch {
      setError('Something went wrong. Please try again.')
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

        <StepIndicator current={step} total={totalSteps} />

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
          {step === 3 && <StepBikes bikes={bikes} setBikes={setBikes} bikePhotos={bikePhotos} setBikePhotos={setBikePhotos} />}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">Verify your phone</h2>
              <p className="text-zinc-400 text-sm mb-6">One last step to activate your account.</p>
              <PhoneVerifyForm onVerified={handlePhoneVerified} />
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 1 && step < 4 && (
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
                  {submitting ? 'Setting up…' : phoneRequired ? 'Next' : 'Complete setup'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
