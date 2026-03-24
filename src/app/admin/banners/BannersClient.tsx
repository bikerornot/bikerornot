'use client'

import { useState, useEffect } from 'react'
import {
  getAllBanners,
  createBanner,
  updateBanner,
  toggleBannerActive,
  deleteBanner,
} from '@/app/actions/banners'
import type { SiteBanner, BannerAudience } from '@/lib/supabase/types'

const COLORS = [
  { value: 'orange', label: 'Orange', preview: 'bg-orange-500' },
  { value: 'blue', label: 'Blue', preview: 'bg-blue-600' },
  { value: 'green', label: 'Green', preview: 'bg-emerald-600' },
  { value: 'red', label: 'Red', preview: 'bg-red-600' },
  { value: 'yellow', label: 'Yellow', preview: 'bg-yellow-500' },
  { value: 'zinc', label: 'Dark', preview: 'bg-zinc-800' },
]

const AUDIENCES: { value: BannerAudience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'unverified', label: 'Unverified Only' },
  { value: 'verified', label: 'Verified Only' },
]

const inputClass = 'w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors'

export default function BannersClient() {
  const [banners, setBanners] = useState<SiteBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  // Form state
  const [text, setText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [bgColor, setBgColor] = useState('orange')
  const [active, setActive] = useState(true)
  const [priority, setPriority] = useState(0)
  const [dismissible, setDismissible] = useState(true)
  const [audience, setAudience] = useState<BannerAudience>('all')
  const [startsAt, setStartsAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  async function loadBanners() {
    setLoading(true)
    const data = await getAllBanners()
    setBanners(data)
    setLoading(false)
  }

  useEffect(() => { loadBanners() }, [])

  function resetForm() {
    setEditingId(null)
    setText('')
    setLinkUrl('')
    setLinkText('')
    setBgColor('orange')
    setActive(true)
    setPriority(0)
    setDismissible(true)
    setAudience('all')
    setStartsAt('')
    setExpiresAt('')
    setError('')
  }

  function openCreate() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(banner: SiteBanner) {
    setEditingId(banner.id)
    setText(banner.text)
    setLinkUrl(banner.link_url ?? '')
    setLinkText(banner.link_text ?? '')
    setBgColor(banner.bg_color)
    setActive(banner.active)
    setPriority(banner.priority)
    setDismissible(banner.dismissible)
    setAudience(banner.audience)
    setStartsAt(banner.starts_at ? banner.starts_at.slice(0, 16) : '')
    setExpiresAt(banner.expires_at ? banner.expires_at.slice(0, 16) : '')
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!text.trim()) { setError('Banner text is required'); return }
    setSaving(true)
    setError('')
    try {
      const input = {
        text: text.trim(),
        link_url: linkUrl.trim() || undefined,
        link_text: linkText.trim() || undefined,
        bg_color: bgColor,
        active,
        priority,
        dismissible,
        audience,
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }

      if (editingId) {
        await updateBanner(editingId, {
          ...input,
          link_url: input.link_url ?? null,
          link_text: input.link_text ?? null,
          starts_at: input.starts_at ?? null,
          expires_at: input.expires_at ?? null,
        })
      } else {
        await createBanner(input)
      }

      setShowForm(false)
      resetForm()
      await loadBanners()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(bannerId: string) {
    const newActive = await toggleBannerActive(bannerId)
    setBanners(prev => prev.map(b => b.id === bannerId ? { ...b, active: newActive } : b))
  }

  async function handleDelete(bannerId: string) {
    await deleteBanner(bannerId)
    setBanners(prev => prev.filter(b => b.id !== bannerId))
    setConfirmDelete(null)
  }

  const colorPreview = COLORS.find(c => c.value === bgColor)?.preview ?? 'bg-orange-500'

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Site Banners</h1>
          <p className="text-sm text-zinc-500 mt-1">Announcement banners shown at the top of the feed</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Banner
        </button>
      </div>

      {/* Banner form */}
      {showForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingId ? 'Edit Banner' : 'Create Banner'}
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Text */}
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Banner Text *</label>
              <input
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="e.g. Classifieds are now live! List your bike for sale."
                className={inputClass}
              />
            </div>

            {/* Link URL + Link Text */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Link URL</label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="/classifieds"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Link Text</label>
                <input
                  type="text"
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                  placeholder="Check it out"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setBgColor(c.value)}
                    className={`w-8 h-8 rounded-lg ${c.preview} transition-all ${
                      bgColor === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : 'opacity-60 hover:opacity-100'
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            {/* Audience + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Audience</label>
                <select
                  value={audience}
                  onChange={e => setAudience(e.target.value as BannerAudience)}
                  className={inputClass}
                >
                  {AUDIENCES.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Priority (higher = shown first)</label>
                <input
                  type="number"
                  value={priority}
                  onChange={e => setPriority(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Scheduling */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Starts At (optional)</label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={e => setStartsAt(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs font-medium block mb-1.5">Expires At (optional)</label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-orange-500" />
                <span className="text-zinc-300 text-sm">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={dismissible} onChange={e => setDismissible(e.target.checked)} className="accent-orange-500" />
                <span className="text-zinc-300 text-sm">Dismissible</span>
              </label>
            </div>

            {/* Preview */}
            <div>
              <label className="text-zinc-400 text-xs font-medium block mb-1.5">Preview</label>
              <div className={`${colorPreview} rounded-lg px-4 py-2 text-sm ${bgColor === 'yellow' ? 'text-black' : 'text-white'}`}>
                {text || 'Banner text preview...'}
                {linkUrl && linkText && (
                  <span className="ml-1 underline font-semibold">{linkText}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowForm(false); resetForm() }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : editingId ? 'Update Banner' : 'Create Banner'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banners list */}
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : banners.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <p className="text-zinc-400 text-base">No banners yet.</p>
          <p className="text-zinc-600 text-sm mt-1">Create one to announce features or promotions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map(banner => {
            const color = COLORS.find(c => c.value === banner.bg_color)
            const audienceLabel = AUDIENCES.find(a => a.value === banner.audience)?.label
            const isExpired = banner.expires_at && new Date(banner.expires_at) < new Date()

            return (
              <div key={banner.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Color preview strip */}
                <div className={`${color?.preview ?? 'bg-orange-500'} px-4 py-2 text-sm ${banner.bg_color === 'yellow' ? 'text-black' : 'text-white'}`}>
                  {banner.text}
                  {banner.link_text && (
                    <span className="ml-1 underline font-semibold">{banner.link_text}</span>
                  )}
                </div>

                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                      banner.active && !isExpired ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700/50 text-zinc-400'
                    }`}>
                      {isExpired ? 'Expired' : banner.active ? 'Active' : 'Inactive'}
                    </span>
                    <span>Priority: {banner.priority}</span>
                    <span>{audienceLabel}</span>
                    {banner.dismissible && <span>Dismissible</span>}
                    {banner.link_url && <span className="text-zinc-600">{banner.link_url}</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(banner.id)}
                      className={`text-xs px-2 py-1 rounded-md transition-colors ${
                        banner.active
                          ? 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20'
                          : 'text-green-400 bg-green-500/10 hover:bg-green-500/20'
                      }`}
                    >
                      {banner.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => openEdit(banner)}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(banner.id)}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="fixed inset-0 bg-black/60" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-zinc-900 rounded-2xl border border-zinc-800 p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">Delete Banner?</h3>
            <p className="text-sm text-zinc-400 mb-6">This will permanently remove the banner and all dismissal records.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
