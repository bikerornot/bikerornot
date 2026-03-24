'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { updateListing, uploadListingImages, deleteListingImage, publishListing } from '@/app/actions/classifieds'
import { compressImage } from '@/lib/compress'
import { getImageUrl } from '@/lib/supabase/image'
import BikeSelector from '@/app/settings/BikeSelector'
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  type ListingDetail,
  type ListingCategory,
  type ListingCondition,
  type PriceType,
  type ListingImage,
} from '@/lib/supabase/types'

interface Props {
  listing: ListingDetail
}

const categoryEntries = Object.entries(LISTING_CATEGORIES) as [ListingCategory, string][]
const conditionEntries = Object.entries(LISTING_CONDITIONS) as [ListingCondition, { label: string; description: string }][]

export default function EditListingClient({ listing }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [category, setCategory] = useState<ListingCategory>(listing.category)
  const [bikeData, setBikeData] = useState({ year: String(listing.year), make: listing.make, model: listing.model })
  const [trim, setTrim] = useState(listing.trim ?? '')
  const [color, setColor] = useState(listing.color ?? '')
  const [condition, setCondition] = useState<ListingCondition>(listing.condition)
  const [mileage, setMileage] = useState(listing.mileage != null ? String(listing.mileage) : '')
  const [vin, setVin] = useState(listing.vin ?? '')
  const [modifications, setModifications] = useState(listing.modifications ?? '')
  const [title, setTitle] = useState(listing.title)
  const [description, setDescription] = useState(listing.description ?? '')
  const [priceType, setPriceType] = useState<PriceType>(listing.price_type)
  const [price, setPrice] = useState(listing.price != null ? String(listing.price) : '')
  const [tradeConsidered, setTradeConsidered] = useState(listing.trade_considered)
  const [zipCode, setZipCode] = useState(listing.zip_code)
  const [showPhone, setShowPhone] = useState(listing.show_phone)
  const [existingImages, setExistingImages] = useState<ListingImage[]>(listing.images)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateListing(listing.id, {
        category,
        year: Number(bikeData.year),
        make: bikeData.make,
        model: bikeData.model,
        trim: trim || null,
        color: color || null,
        condition,
        mileage: mileage ? Number(mileage) : null,
        vin: vin || null,
        modifications: modifications || null,
        title,
        description: description || null,
        price_type: priceType,
        price: priceType === 'offer' ? null : (price ? Number(price) : null),
        trade_considered: tradeConsidered,
        zip_code: zipCode,
        show_phone: showPhone,
      })

      // Upload new images if any
      if (newFiles.length > 0) {
        setUploading(true)
        const formData = new FormData()
        for (const file of newFiles) {
          const compressed = await compressImage(file, 2, 1200)
          formData.append('images', compressed)
        }
        await uploadListingImages(listing.id, formData)
        setNewFiles([])
        setUploading(false)
      }

      // If draft, offer to publish
      if (listing.status === 'draft') {
        try {
          await publishListing(listing.id)
        } catch {
          // May fail if no images etc — that's OK, saved as draft
        }
      }

      router.push(`/classifieds/${listing.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteImage(imageId: string) {
    try {
      await deleteListingImage(imageId)
      setExistingImages(prev => prev.filter(img => img.id !== imageId))
    } catch (err: any) {
      setError(err.message || 'Failed to delete image')
    }
  }

  function handleNewFiles(files: FileList) {
    const total = existingImages.length + newFiles.length + files.length
    if (total > 24) {
      setError('Maximum 24 images per listing')
      return
    }
    setNewFiles(prev => [...prev, ...Array.from(files)])
  }

  const inputClass = 'w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-orange-500 transition-colors'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Edit Listing</h1>
        <Link href="/classifieds/my-listings" className="text-sm text-zinc-400 hover:text-white transition-colors">
          Cancel
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {/* Bike Info */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Bike Info</h2>
          <div className="space-y-4">
            <BikeSelector value={bikeData} onChange={setBikeData} />

            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {categoryEntries.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      category === value
                        ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                        : 'bg-zinc-800 text-zinc-300 border border-transparent hover:border-zinc-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Trim</label>
                <input type="text" value={trim} onChange={e => setTrim(e.target.value)} placeholder="e.g. Special, Classic" className={inputClass} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Color</label>
                <input type="text" value={color} onChange={e => setColor(e.target.value)} placeholder="Optional" className={inputClass} />
              </div>
            </div>
          </div>
        </section>

        {/* Condition */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Condition</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {conditionEntries.map(([value, { label, description: desc }]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCondition(value)}
                  className={`text-left px-3 py-2 rounded-lg transition-colors ${
                    condition === value
                      ? 'bg-orange-500/15 border border-orange-500/30'
                      : 'bg-zinc-800 border border-transparent hover:border-zinc-700'
                  }`}
                >
                  <p className={`text-sm font-medium ${condition === value ? 'text-orange-400' : 'text-zinc-300'}`}>{label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Mileage</label>
                <input type="number" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="Optional" className={inputClass} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">VIN</label>
                <input type="text" value={vin} onChange={e => setVin(e.target.value.toUpperCase())} placeholder="Optional (17 chars)" maxLength={17} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Modifications</label>
              <textarea value={modifications} onChange={e => setModifications(e.target.value)} rows={3} placeholder="Optional — describe any mods" className={inputClass + ' resize-none'} />
            </div>
          </div>
        </section>

        {/* Description & Price */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Description & Price</h2>
          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Title <span className="text-zinc-600">({title.length}/100)</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} className={inputClass} />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} maxLength={5000} placeholder="Describe your bike..." className={inputClass + ' resize-none'} />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Price Type</label>
              <div className="flex gap-2">
                {(['fixed', 'obo', 'offer'] as PriceType[]).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPriceType(pt)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      priceType === pt ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {pt === 'fixed' ? 'Fixed' : pt === 'obo' ? 'OBO' : 'Make Offer'}
                  </button>
                ))}
              </div>
            </div>
            {priceType !== 'offer' && (
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Price ($)</label>
                <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" className={inputClass} />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tradeConsidered} onChange={e => setTradeConsidered(e.target.checked)} className="accent-orange-500" />
              <span className="text-zinc-300 text-sm">Open to trades</span>
            </label>
          </div>
        </section>

        {/* Photos */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Photos</h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-3">
            {existingImages.map((img, i) => (
              <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800 group">
                <Image src={getImageUrl('classifieds', img.storage_path)} alt="" fill className="object-cover" />
                {i === 0 && (
                  <span className="absolute top-1 left-1 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Cover</span>
                )}
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
            {newFiles.map((file, i) => (
              <div key={`new-${i}`} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
            <label className="aspect-square rounded-lg border-2 border-dashed border-zinc-700 hover:border-orange-500/50 flex items-center justify-center cursor-pointer transition-colors">
              <span className="text-zinc-500 text-2xl">+</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => e.target.files && handleNewFiles(e.target.files)}
              />
            </label>
          </div>
          <p className="text-zinc-600 text-xs">{existingImages.length + newFiles.length} / 24 photos</p>
        </section>

        {/* Location */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Location</h2>
          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Zip Code</label>
              <input type="text" value={zipCode} onChange={e => setZipCode(e.target.value)} maxLength={10} className={inputClass} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showPhone} onChange={e => setShowPhone(e.target.checked)} className="accent-orange-500" />
              <span className="text-zinc-300 text-sm">Show my phone number on listing</span>
            </label>
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-zinc-800">
          <Link
            href="/classifieds/my-listings"
            className="flex-1 text-center py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {saving ? (uploading ? 'Uploading Photos...' : 'Saving...') : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
