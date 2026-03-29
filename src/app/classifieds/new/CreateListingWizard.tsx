'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import PhoneVerifyForm from '@/app/components/PhoneVerifyForm'
import BikeSelector from '@/app/settings/BikeSelector'
import { compressImage } from '@/lib/compress'
import { createListing, uploadListingImages, publishListing } from '@/app/actions/classifieds'
import { getImageUrl } from '@/lib/supabase/image'
import { detectBikeCategory } from '@/lib/bike-category'
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  type ListingCategory,
  type ListingCondition,
  type PriceType,
} from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GarageBike {
  id: string
  year: number | null
  make: string | null
  model: string | null
  photo_url: string | null
}

interface Props {
  eligibility: {
    eligible: boolean
    reason?: string
    activeCount: number
    isVerified: boolean
  }
  garageBikes: GarageBike[]
  userZipCode: string
}

interface FormState {
  // Step 1 – Bike
  bikeSource: 'garage' | 'manual' | null
  userBikeId: string | null
  year: string
  make: string
  model: string
  trim: string
  category: ListingCategory | null

  // Step 2 – Condition
  condition: ListingCondition | null
  mileage: string
  vin: string
  modifications: string

  // Step 3 – Description & Price
  title: string
  description: string
  priceType: PriceType
  price: string
  tradeConsidered: boolean

  // Step 4 – Photos
  photos: File[]

  // Step 5 – Location
  zipCode: string
  showPhone: boolean
  duration: 30 | 60 | 90
}

const INITIAL_FORM: FormState = {
  bikeSource: null,
  userBikeId: null,
  year: '',
  make: '',
  model: '',
  trim: '',
  category: null,
  condition: null,
  mileage: '',
  vin: '',
  modifications: '',
  title: '',
  description: '',
  priceType: 'fixed',
  price: '',
  tradeConsidered: false,
  photos: [],
  zipCode: '',
  showPhone: false,
  duration: 90,
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const completed = step > n
        const active = step === n
        return (
          <div key={n} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                completed
                  ? 'bg-orange-500 text-white'
                  : active
                    ? 'bg-orange-500/20 text-orange-400 border-2 border-orange-500'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
              }`}
            >
              {completed ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                n
              )}
            </div>
            {i < total - 1 && (
              <div
                className={`w-8 sm:w-12 h-0.5 transition-colors ${
                  step > n ? 'bg-orange-500' : 'bg-zinc-700'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CreateListingWizard({ eligibility, garageBikes, userZipCode }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM, zipCode: userZipCode })
  const [publishing, setPublishing] = useState(false)
  const [publishProgress, setPublishProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Photo preview URLs
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  // Check if selected garage bike has a photo (will be copied server-side)
  const selectedGarageBike = garageBikes.find(b => b.id === form.userBikeId)
  const garageHasPhoto = !!(selectedGarageBike?.photo_url)

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  // -------------------------------------------------------------------------
  // Eligibility gates
  // -------------------------------------------------------------------------
  if (!eligibility.isVerified && eligibility.reason === 'sms_required') {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold text-white mb-2">Phone Verification Required</h1>
        <p className="text-zinc-400 mb-6">
          To protect buyers, all sellers must verify their phone number before listing a bike.
        </p>
        <PhoneVerifyForm onVerified={() => router.refresh()} />
      </div>
    )
  }

  if (eligibility.reason === 'limit_reached') {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold text-white mb-2">Listing Limit Reached</h1>
        <p className="text-zinc-400 mb-6">
          You already have {eligibility.activeCount} active listings (max 3).
          Mark one as sold or delete it to free up a slot.
        </p>
        <Link
          href="/classifieds/my-listings"
          className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors"
        >
          Manage My Listings
        </Link>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Validation per step
  // -------------------------------------------------------------------------
  function canProceed(): boolean {
    switch (step) {
      case 1:
        return !!form.year && !!form.make && !!form.model && !!form.category
      case 2:
        return !!form.condition
      case 3:
        return form.title.trim().length >= 5 && form.title.trim().length <= 100 &&
          !!form.price && Number(form.price) > 0
      case 4:
        // If garage bike has a photo, it'll be copied server-side — no upload needed
        return form.photos.length >= 1 || garageHasPhoto
      case 5:
        return form.zipCode.trim().length === 5
      default:
        return true
    }
  }

  // -------------------------------------------------------------------------
  // Photo handling
  // -------------------------------------------------------------------------
  function handlePhotoSelect(files: FileList | null) {
    if (!files) return
    const remaining = 24 - form.photos.length
    const newFiles = Array.from(files).slice(0, remaining)
    if (newFiles.length === 0) return

    const newUrls = newFiles.map(f => URL.createObjectURL(f))
    setForm(prev => ({ ...prev, photos: [...prev.photos, ...newFiles] }))
    setPreviewUrls(prev => [...prev, ...newUrls])
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(previewUrls[index])
    setForm(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }))
    setPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handlePhotoSelect(e.dataTransfer.files)
  }

  // -------------------------------------------------------------------------
  // Publish / Save Draft
  // -------------------------------------------------------------------------
  async function handleSubmit(publish: boolean) {
    setError(null)
    setPublishing(true)

    try {
      // 1. Create listing
      setPublishProgress('Creating listing...')
      const { id } = await createListing({
        category: form.category!,
        year: Number(form.year),
        make: form.make,
        model: form.model,
        trim: form.trim.trim() || undefined,
        condition: form.condition!,
        mileage: form.mileage ? Number(form.mileage) : undefined,
        vin: form.vin.trim() || undefined,
        modifications: form.modifications.trim() || undefined,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        price: Number(form.price),
        price_type: form.priceType,
        trade_considered: form.tradeConsidered,
        zip_code: form.zipCode.trim(),
        show_phone: form.showPhone,
        user_bike_id: form.userBikeId,
      })

      // 2. Compress & upload images
      if (form.photos.length > 0) {
        setPublishProgress(`Compressing ${form.photos.length} photo${form.photos.length > 1 ? 's' : ''}...`)

        const compressed: File[] = []
        for (let i = 0; i < form.photos.length; i++) {
          setPublishProgress(`Compressing photo ${i + 1} of ${form.photos.length}...`)
          const c = await compressImage(form.photos[i], 2, 1200)
          compressed.push(c)
        }

        setPublishProgress(`Uploading ${compressed.length} photo${compressed.length > 1 ? 's' : ''}...`)
        const formData = new FormData()
        compressed.forEach(f => formData.append('images', f))
        await uploadListingImages(id, formData)
      }

      // 3. Publish if requested
      if (publish) {
        setPublishProgress('Publishing...')
        await publishListing(id)
        router.push(`/classifieds/${id}`)
      } else {
        router.push('/classifieds/my-listings')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setPublishing(false)
      setPublishProgress('')
    }
  }

  // -------------------------------------------------------------------------
  // Select garage bike
  // -------------------------------------------------------------------------
  function selectGarageBike(bike: GarageBike) {
    const detectedCategory = detectBikeCategory(
      bike.make ?? '', bike.model ?? '', bike.year ?? undefined
    )
    const autoTitle = [bike.year, bike.make, bike.model].filter(Boolean).join(' ')
    setForm(prev => ({
      ...prev,
      bikeSource: 'garage',
      userBikeId: bike.id,
      year: bike.year?.toString() ?? '',
      make: bike.make ?? '',
      model: bike.model ?? '',
      category: detectedCategory,
      title: prev.title || autoTitle,
    }))
  }

  // -------------------------------------------------------------------------
  // Publishing overlay
  // -------------------------------------------------------------------------
  if (publishing) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white font-semibold text-lg">{publishProgress}</p>
        <p className="text-zinc-400 text-sm mt-2">Please don&apos;t close this page.</p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Review screen (step 6)
  // -------------------------------------------------------------------------
  if (step === 6) {
    const categoryLabel = form.category ? LISTING_CATEGORIES[form.category] : ''
    const conditionInfo = form.condition ? LISTING_CONDITIONS[form.condition] : null
    const priceLabel = form.priceType === 'obo'
      ? `$${Number(form.price).toLocaleString()} OBO`
      : `$${Number(form.price).toLocaleString()}`

    return (
      <div>
        <h1 className="text-xl font-bold text-white mb-6">Review Your Listing</h1>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* Bike */}
        <ReviewSection title="Bike" onEdit={() => setStep(1)}>
          <p className="text-white">{form.year} {form.make} {form.model}{form.trim ? ` ${form.trim}` : ''}</p>
          <p className="text-zinc-400 text-sm">{categoryLabel}</p>
        </ReviewSection>

        {/* Condition */}
        <ReviewSection title="Condition" onEdit={() => setStep(2)}>
          <p className="text-white">{conditionInfo?.label}</p>
          {form.mileage && <p className="text-zinc-400 text-sm">{Number(form.mileage).toLocaleString()} miles</p>}
          {form.vin && <p className="text-zinc-400 text-sm">VIN: {form.vin}</p>}
          {form.modifications && <p className="text-zinc-400 text-sm mt-1">{form.modifications}</p>}
        </ReviewSection>

        {/* Description & Price */}
        <ReviewSection title="Description & Price" onEdit={() => setStep(3)}>
          <p className="text-white font-medium">{form.title}</p>
          {form.description && <p className="text-zinc-400 text-sm mt-1 line-clamp-3">{form.description}</p>}
          <p className="text-orange-400 font-semibold mt-1">{priceLabel}</p>
          {form.tradeConsidered && <p className="text-zinc-400 text-sm">Open to trades</p>}
        </ReviewSection>

        {/* Photos */}
        <ReviewSection title={`Photos (${form.photos.length})`} onEdit={() => setStep(4)}>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {previewUrls.slice(0, 6).map((url, i) => (
              <div key={i} className="aspect-square relative rounded-lg overflow-hidden bg-zinc-800">
                <img src={url} alt="" className="w-full h-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-xs text-white py-0.5">
                    Cover
                  </span>
                )}
              </div>
            ))}
            {form.photos.length > 6 && (
              <div className="aspect-square rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm">
                +{form.photos.length - 6}
              </div>
            )}
          </div>
        </ReviewSection>

        {/* Location */}
        <ReviewSection title="Location" onEdit={() => setStep(5)}>
          <p className="text-white">ZIP: {form.zipCode}</p>
          <p className="text-zinc-400 text-sm">{form.showPhone ? 'Phone number visible' : 'Phone number hidden'}</p>
          <p className="text-zinc-400 text-sm">{form.duration}-day listing</p>
        </ReviewSection>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            onClick={() => handleSubmit(true)}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Publish Listing
          </button>
          <button
            onClick={() => handleSubmit(false)}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-3 rounded-xl transition-colors"
          >
            Save as Draft
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Step content
  // -------------------------------------------------------------------------
  return (
    <div>
      <ProgressBar step={step} total={5} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {step === 1 && <StepBike form={form} update={update} garageBikes={garageBikes} selectGarageBike={selectGarageBike} />}
      {step === 2 && <StepCondition form={form} update={update} />}
      {step === 3 && <StepDescription form={form} update={update} />}
      {step === 4 && (
        <StepPhotos
          form={form}
          previewUrls={previewUrls}
          fileInputRef={fileInputRef}
          handlePhotoSelect={handlePhotoSelect}
          removePhoto={removePhoto}
          handleDrop={handleDrop}
          garagePhotoUrl={garageHasPhoto ? selectedGarageBike!.photo_url! : null}
        />
      )}
      {step === 5 && <StepLocation form={form} update={update} />}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8">
        {step > 1 ? (
          <button
            onClick={() => { setError(null); setStep(s => s - 1) }}
            className="text-zinc-400 hover:text-white transition-colors font-medium"
          >
            Back
          </button>
        ) : (
          <Link href="/classifieds" className="text-zinc-400 hover:text-white transition-colors font-medium">
            Cancel
          </Link>
        )}
        <button
          onClick={() => { setError(null); setStep(s => s + 1) }}
          disabled={!canProceed()}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-2.5 px-8 rounded-xl transition-colors"
        >
          {step === 5 ? 'Review Listing' : 'Next'}
        </button>
      </div>
    </div>
  )
}

// ===========================================================================
// Review section wrapper
// ===========================================================================
function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">{title}</h3>
        <button onClick={onEdit} className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors">
          Edit
        </button>
      </div>
      {children}
    </div>
  )
}

// ===========================================================================
// STEP 1 — Bike
// ===========================================================================
function StepBike({
  form,
  update,
  garageBikes,
  selectGarageBike,
}: {
  form: FormState
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  garageBikes: GarageBike[]
  selectGarageBike: (bike: GarageBike) => void
}) {
  const [mode, setMode] = useState<'choose' | 'garage' | 'manual'>(
    form.bikeSource === 'garage' ? 'garage' : form.bikeSource === 'manual' ? 'manual' : 'choose'
  )

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-4">What are you selling?</h2>

      {/* Source selector */}
      {mode === 'choose' && (
        <div className="space-y-3">
          {garageBikes.length > 0 && (
            <button
              onClick={() => setMode('garage')}
              className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 text-left transition-colors"
            >
              <p className="text-white font-semibold">Import from Garage</p>
              <p className="text-zinc-400 text-sm mt-1">
                Pick one of your {garageBikes.length} saved bike{garageBikes.length !== 1 ? 's' : ''}
              </p>
            </button>
          )}
          <button
            onClick={() => {
              setMode('manual')
              update('bikeSource', 'manual')
              update('userBikeId', null)
            }}
            className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 text-left transition-colors"
          >
            <p className="text-white font-semibold">Enter Manually</p>
            <p className="text-zinc-400 text-sm mt-1">Type in the year, make, and model</p>
          </button>
        </div>
      )}

      {/* Garage picker */}
      {mode === 'garage' && (
        <div>
          <button
            onClick={() => { setMode('choose'); update('bikeSource', null); update('userBikeId', null) }}
            className="text-zinc-400 hover:text-white text-sm mb-4 inline-block transition-colors"
          >
            &larr; Back to options
          </button>
          <div className="grid grid-cols-1 gap-3">
            {garageBikes.map(bike => {
              const selected = form.userBikeId === bike.id
              return (
                <button
                  key={bike.id}
                  onClick={() => selectGarageBike(bike)}
                  className={`flex items-center gap-4 rounded-xl p-3 text-left border transition-colors ${
                    selected
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="w-16 h-16 rounded-lg bg-zinc-700 overflow-hidden flex-shrink-0">
                    {bike.photo_url ? (
                      <Image
                        src={getImageUrl('bikes', bike.photo_url)}
                        alt=""
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      {[bike.year, bike.make, bike.model].filter(Boolean).join(' ') || 'Unknown Bike'}
                    </p>
                    {selected && <p className="text-orange-400 text-sm">Selected</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Garage selection — show bike as read-only */}
      {mode === 'garage' && form.userBikeId && (
        <div className="mt-4 space-y-3">
          <div className="bg-zinc-800 rounded-xl px-4 py-3">
            <p className="text-zinc-400 text-sm font-medium mb-1">Selected Bike</p>
            <p className="text-white text-lg font-semibold">
              {[form.year, form.make, form.model].filter(Boolean).join(' ')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Trim <span className="text-zinc-600">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Special, Classic, Limited"
              value={form.trim}
              onChange={e => update('trim', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      )}

      {/* Manual entry */}
      {mode === 'manual' && (
        <div className="mt-4 space-y-4">
          <button
            onClick={() => { setMode('choose'); update('bikeSource', null); update('year', ''); update('make', ''); update('model', '') }}
            className="text-zinc-400 hover:text-white text-sm mb-2 inline-block transition-colors"
          >
            &larr; Back to options
          </button>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Year / Make / Model</label>
            <BikeSelector
              value={{ year: form.year, make: form.make, model: form.model }}
              onChange={v => {
                update('year', v.year)
                update('make', v.make)
                update('model', v.model)
                if (v.make && v.model) {
                  update('category', detectBikeCategory(v.make, v.model, v.year ? Number(v.year) : undefined))
                }
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Trim <span className="text-zinc-600">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Special, Classic, Limited"
              value={form.trim}
              onChange={e => update('trim', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// STEP 2 — Condition
// ===========================================================================
function StepCondition({
  form,
  update,
}: {
  form: FormState
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-4">Condition &amp; Details</h2>

      {/* Condition cards */}
      <div className="space-y-2 mb-6">
        {(Object.entries(LISTING_CONDITIONS) as [ListingCondition, { label: string; description: string }][]).map(
          ([key, { label, description }]) => (
            <button
              key={key}
              onClick={() => update('condition', key)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                form.condition === key
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
              }`}
            >
              <p className={`font-semibold ${form.condition === key ? 'text-orange-400' : 'text-white'}`}>
                {label}
              </p>
              <p className="text-zinc-400 text-sm mt-0.5">{description}</p>
            </button>
          )
        )}
      </div>

      {/* Category (auto-detected, editable) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-400 mb-2">
          Category
          {form.category && <span className="text-zinc-600 ml-1">(auto-detected — change if needed)</span>}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(LISTING_CATEGORIES) as [ListingCategory, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => update('category', key)}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                form.category === key
                  ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Mileage */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Mileage</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 12500"
          value={form.mileage}
          onChange={e => update('mileage', e.target.value.replace(/\D/g, ''))}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* VIN */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">
          VIN <span className="text-zinc-600">(optional)</span>
        </label>
        <input
          type="text"
          maxLength={17}
          placeholder="17-character VIN"
          value={form.vin}
          onChange={e => update('vin', e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
        />
        {form.vin.length > 0 && form.vin.length !== 17 && (
          <p className="text-zinc-500 text-sm mt-1">{form.vin.length}/17 characters</p>
        )}
      </div>

      {/* Modifications */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">
          Modifications <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          rows={3}
          maxLength={2000}
          placeholder="Exhaust, handlebars, suspension, etc."
          value={form.modifications}
          onChange={e => update('modifications', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
        />
      </div>
    </div>
  )
}

// ===========================================================================
// STEP 3 — Description & Price
// ===========================================================================
function StepDescription({
  form,
  update,
}: {
  form: FormState
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-4">Description &amp; Price</h2>

      {/* Title */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Listing Title</label>
        <input
          type="text"
          maxLength={100}
          placeholder="e.g. 2019 Harley Street Glide — Low Miles"
          value={form.title}
          onChange={e => update('title', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <p className={`text-sm mt-1 ${form.title.length > 90 ? 'text-orange-400' : 'text-zinc-500'}`}>
          {form.title.length}/100
        </p>
      </div>

      {/* Description */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">
          Description <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          rows={5}
          maxLength={5000}
          placeholder="Tell buyers about this bike — maintenance history, reason for selling, included extras..."
          value={form.description}
          onChange={e => update('description', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
        />
        {form.description.length > 0 && (
          <p className={`text-sm mt-1 ${form.description.length > 4800 ? 'text-orange-400' : 'text-zinc-500'}`}>
            {form.description.length}/5000
          </p>
        )}
      </div>

      {/* Price type */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-zinc-400 mb-2">Pricing</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: 'fixed' as PriceType, label: 'Fixed Price' },
            { key: 'obo' as PriceType, label: 'OBO' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => update('priceType', key)}
              className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                form.priceType === key
                  ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Price input */}
      {(
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Asking Price ($)
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={form.price}
            onChange={e => update('price', e.target.value.replace(/\D/g, ''))}
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {form.price && Number(form.price) > 0 && (
            <p className="text-zinc-500 text-sm mt-1">${Number(form.price).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Trade toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.tradeConsidered}
          onChange={e => update('tradeConsidered', e.target.checked)}
          className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
        />
        <span className="text-white text-base">Open to trades</span>
      </label>
    </div>
  )
}

// ===========================================================================
// STEP 4 — Photos
// ===========================================================================
function StepPhotos({
  form,
  previewUrls,
  fileInputRef,
  handlePhotoSelect,
  removePhoto,
  handleDrop,
  garagePhotoUrl,
}: {
  form: FormState
  previewUrls: string[]
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handlePhotoSelect: (files: FileList | null) => void
  removePhoto: (index: number) => void
  handleDrop: (e: React.DragEvent) => void
  garagePhotoUrl: string | null
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Photos</h2>
      <p className="text-zinc-400 text-sm mb-4">
        Add up to 24 photos. The first photo will be the cover image.
      </p>

      {/* Show garage photo if available */}
      {garagePhotoUrl && (
        <div className="mb-4">
          <p className="text-zinc-400 text-sm font-medium mb-2">From your garage</p>
          <div className="inline-block relative">
            <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-800">
              <img src={getImageUrl('bikes', garagePhotoUrl)} alt="" className="w-full h-full object-cover" />
            </div>
            <span className="absolute top-1 left-1 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              Cover
            </span>
          </div>
          <p className="text-zinc-500 text-sm mt-1">This photo will be included automatically. Add more below.</p>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4"
      >
        <svg className="w-10 h-10 text-zinc-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
        </svg>
        <p className="text-zinc-400 text-base">
          Drag &amp; drop photos or <span className="text-orange-400">browse</span>
        </p>
        <p className="text-zinc-500 text-sm mt-1">
          {form.photos.length + (garagePhotoUrl ? 1 : 0)}/24 photos added
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => {
          handlePhotoSelect(e.target.files)
          e.target.value = ''
        }}
      />

      {/* Thumbnails */}
      {previewUrls.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {previewUrls.map((url, i) => (
            <div key={i} className="aspect-square relative rounded-lg overflow-hidden bg-zinc-800 group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute top-0 left-0 bg-orange-500 text-white text-xs font-semibold px-1.5 py-0.5 rounded-br-lg">
                  Cover
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); removePhoto(i) }}
                className="absolute top-1 right-1 w-6 h-6 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// STEP 5 — Location
// ===========================================================================
function StepLocation({
  form,
  update,
}: {
  form: FormState
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-4">Location &amp; Options</h2>

      {/* Zip Code */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Zip Code</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="e.g. 90210"
          value={form.zipCode}
          onChange={e => update('zipCode', e.target.value.replace(/\D/g, ''))}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-base placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Show phone */}
      <div className="mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.showPhone}
            onChange={e => update('showPhone', e.target.checked)}
            className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
          />
          <div>
            <span className="text-white text-base">Show my phone number on this listing</span>
            <p className="text-zinc-500 text-sm">Buyers can call or text you directly</p>
          </div>
        </label>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2">Listing Duration</label>
        <div className="grid grid-cols-3 gap-2">
          {([30, 60, 90] as const).map(days => (
            <button
              key={days}
              onClick={() => update('duration', days)}
              className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                form.duration === days
                  ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
