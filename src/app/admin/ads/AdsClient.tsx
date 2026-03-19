'use client'

import { useState, useEffect, useRef } from 'react'
import {
  getAdStats,
  getAdvertisers,
  getCampaigns,
  createAdvertiser,
  createCampaign,
  createAd,
  updateAd,
  toggleAdStatus,
  type AdWithStats,
  type Advertiser,
  type Campaign,
} from '@/app/actions/ads'
import { getImageUrl } from '@/lib/supabase/image'
import { compressImage } from '@/lib/compress'
import AdCard from '@/app/components/AdCard'

export default function AdsClient() {
  const [ads, setAds] = useState<AdWithStats[]>([])
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  // Date range filter
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [primaryText, setPrimaryText] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [ctaText, setCtaText] = useState('Shop Now')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // New advertiser/campaign modals
  const [showNewAdvertiser, setShowNewAdvertiser] = useState(false)
  const [newAdvName, setNewAdvName] = useState('')
  const [newAdvWebsite, setNewAdvWebsite] = useState('')
  const [newAdvEmail, setNewAdvEmail] = useState('')
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [newCampName, setNewCampName] = useState('')
  const [newCampAdvertiserId, setNewCampAdvertiserId] = useState('')

  async function loadData() {
    setLoading(true)
    const [adsData, advData, campData] = await Promise.all([
      getAdStats(startDate || undefined, endDate || undefined),
      getAdvertisers(),
      getCampaigns(),
    ])
    setAds(adsData)
    setAdvertisers(advData)
    setCampaigns(campData)
    setLoading(false)
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setEditingId(null)
    setPrimaryText('')
    setHeadline('')
    setDescription('')
    setCtaText('Shop Now')
    setDestinationUrl('')
    setCampaignId('')
    setImageFile(null)
    setImagePreview(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function startEdit(ad: AdWithStats) {
    setEditingId(ad.id)
    setPrimaryText(ad.primary_text ?? '')
    setHeadline(ad.headline)
    setDescription(ad.description ?? '')
    setCtaText(ad.cta_text)
    setDestinationUrl(ad.destination_url)
    setCampaignId(ads.find((a) => a.id === ad.id) ? ad.id : '')
    setImagePreview(getImageUrl('ads', ad.image_url))
    setImageFile(null)
    setError('')
    // Find the campaign_id from the ad — we need to look it up
    // Since AdWithStats doesn't have campaign_id directly, find from campaigns
    const matchingCampaign = campaigns.find((c) => c.name === ad.campaign_name)
    if (matchingCampaign) setCampaignId(matchingCampaign.id)
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressed = await compressImage(file)
      setImageFile(compressed)
      setImagePreview(URL.createObjectURL(compressed))
    } catch {
      // Compression failed — use original file
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  async function handleSave() {
    setError('')
    setSaving(true)

    const fd = new FormData()
    fd.set('primaryText', primaryText)
    fd.set('headline', headline)
    fd.set('description', description)
    fd.set('ctaText', ctaText)
    fd.set('destinationUrl', destinationUrl)
    fd.set('campaignId', campaignId)
    if (imageFile) fd.set('image', imageFile)

    const result = editingId
      ? await updateAd(editingId, fd)
      : await createAd(fd)

    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }

    resetForm()
    loadData()
  }

  async function handleToggleStatus(id: string) {
    await toggleAdStatus(id)
    loadData()
  }

  async function handleCreateAdvertiser() {
    if (!newAdvName || !newAdvWebsite || !newAdvEmail) return
    await createAdvertiser(newAdvName, newAdvWebsite, newAdvEmail)
    setShowNewAdvertiser(false)
    setNewAdvName('')
    setNewAdvWebsite('')
    setNewAdvEmail('')
    loadData()
  }

  async function handleCreateCampaign() {
    if (!newCampName || !newCampAdvertiserId) return
    await createCampaign(newCampAdvertiserId, newCampName)
    setShowNewCampaign(false)
    setNewCampName('')
    setNewCampAdvertiserId('')
    loadData()
  }

  function handleFilterApply() {
    loadData()
  }

  // Build preview ad for AdCard
  const selectedCampaign = campaigns.find((c) => c.id === campaignId)
  const selectedAdvertiser = selectedCampaign ? advertisers.find((a) => a.id === selectedCampaign.advertiser_id) : null
  const previewAd = headline ? {
    id: 'preview',
    advertiserName: selectedAdvertiser?.name ?? '',
    primaryText: primaryText || null,
    headline,
    description: description || null,
    imageUrl: imagePreview ?? '',
    ctaText: ctaText || 'Shop Now',
    destinationUrl: destinationUrl || '#',
  } : null

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <h1 className="text-2xl font-bold text-white mb-6">Ad Manager</h1>

      {/* Ad Editor */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          {editingId ? 'Edit Ad' : 'Create Ad'}
        </h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            {/* Campaign selector */}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Campaign</label>
              <div className="flex gap-2">
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">Select campaign…</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({advertisers.find((a) => a.id === c.advertiser_id)?.name ?? 'Unknown'})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCampaign(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-3 py-2 rounded-lg border border-zinc-700 transition-colors"
                >
                  + New
                </button>
              </div>
              {campaigns.length === 0 && advertisers.length === 0 && (
                <p className="text-zinc-500 text-xs mt-1">
                  Create an advertiser first, then a campaign.{' '}
                  <button onClick={() => setShowNewAdvertiser(true)} className="text-orange-400 hover:text-orange-300">
                    Create advertiser
                  </button>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Primary text <span className="text-zinc-600">(above image)</span></label>
              <textarea
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                placeholder="The main message your audience sees first…"
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Headline <span className="text-zinc-600">(bold, below image)</span></label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Premium Biker Gear"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Description <span className="text-zinc-600">(below headline, optional)</span></label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short supporting text…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">CTA button text</label>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="Shop Now"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Destination URL</label>
              <input
                type="url"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Ad image</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !headline || !campaignId || (!imageFile && !editingId)}
                className="bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
              >
                {saving ? 'Saving…' : editingId ? 'Update Ad' : 'Create Ad'}
              </button>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-4 py-2 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div>
            <p className="text-sm text-zinc-400 mb-2">Preview</p>
            <div className="max-w-sm">
              {previewAd ? (
                <AdCard ad={previewAd} preview />
              ) : (
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-8 text-center">
                  <p className="text-zinc-500 text-sm">Enter a headline to see a preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">Ad Performance</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-orange-500"
            />
            <span className="text-zinc-500 text-sm">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              onClick={handleFilterApply}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-500 text-sm py-8 text-center">Loading…</p>
        ) : ads.length === 0 ? (
          <p className="text-zinc-500 text-sm py-8 text-center">No ads yet. Create one above to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4 font-medium">Ad</th>
                  <th className="pb-2 pr-4 font-medium">Campaign</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium text-right">Impressions</th>
                  <th className="pb-2 pr-4 font-medium text-right">Clicks</th>
                  <th className="pb-2 pr-4 font-medium text-right">CTR</th>
                  <th className="pb-2 pr-4 font-medium text-right">Dismissals</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id} className="border-b border-zinc-800/50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getImageUrl('ads', ad.image_url)}
                          alt=""
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                        />
                        <div>
                          <p className="text-white font-medium truncate max-w-[180px]">{ad.headline}</p>
                          <p className="text-zinc-500 text-xs truncate max-w-[180px]">{ad.advertiser_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-zinc-400">{ad.campaign_name}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        ad.status === 'active'
                          ? 'bg-green-500/15 text-green-400'
                          : ad.status === 'paused'
                          ? 'bg-yellow-500/15 text-yellow-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {ad.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-zinc-300 tabular-nums">{ad.impressions.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-right text-zinc-300 tabular-nums">{ad.clicks.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-right text-zinc-300 tabular-nums">{ad.ctr}%</td>
                    <td className="py-3 pr-4 text-right text-zinc-300 tabular-nums">{ad.dismissals.toLocaleString()}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(ad)}
                          className="text-zinc-400 hover:text-white text-xs transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(ad.id)}
                          className="text-zinc-400 hover:text-white text-xs transition-colors"
                        >
                          {ad.status === 'active' ? 'Pause' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Advertiser Modal */}
      {showNewAdvertiser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewAdvertiser(false) }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl p-5">
            <h3 className="text-white font-semibold text-base mb-4">New Advertiser</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newAdvName}
                onChange={(e) => setNewAdvName(e.target.value)}
                placeholder="Company name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
              <input
                type="url"
                value={newAdvWebsite}
                onChange={(e) => setNewAdvWebsite(e.target.value)}
                placeholder="https://example.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
              <input
                type="email"
                value={newAdvEmail}
                onChange={(e) => setNewAdvEmail(e.target.value)}
                placeholder="contact@example.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowNewAdvertiser(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAdvertiser}
                disabled={!newAdvName || !newAdvWebsite || !newAdvEmail}
                className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewCampaign(false) }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl p-5">
            <h3 className="text-white font-semibold text-base mb-4">New Campaign</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Advertiser</label>
                <div className="flex gap-2">
                  <select
                    value={newCampAdvertiserId}
                    onChange={(e) => setNewCampAdvertiserId(e.target.value)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    <option value="">Select…</option>
                    {advertisers.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setShowNewCampaign(false); setShowNewAdvertiser(true) }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-3 py-2 rounded-lg border border-zinc-700 transition-colors"
                  >
                    + New
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={newCampName}
                onChange={(e) => setNewCampName(e.target.value)}
                placeholder="Campaign name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowNewCampaign(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={!newCampName || !newCampAdvertiserId}
                className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
