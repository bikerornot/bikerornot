'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createDealer } from '@/app/actions/hd-dealers'

const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors'
const labelClass = 'block text-xs text-zinc-500 mb-1'

export default function NewDealerClient() {
  const router = useRouter()
  const [hdDealerId, setHdDealerId] = useState('')
  const [name, setName] = useState('')
  const [address1, setAddress1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('USA')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function onCreate() {
    if (!hdDealerId.trim()) return setErr('Dealer ID is required')
    if (!name.trim()) return setErr('Name is required')
    setSaving(true)
    setErr('')
    try {
      const created = await createDealer({
        hd_dealer_id: hdDealerId.trim(),
        name: name.trim(),
        address1: address1 || null,
        city: city || null,
        state: state || null,
        postal_code: postalCode || null,
        country: country || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
        source: 'manual',
        is_active: true,
      })
      router.push(`/admin/dealers/${created.id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create dealer')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link href="/admin/dealers" className="text-zinc-500 hover:text-zinc-300 text-sm inline-flex items-center gap-1 mb-2">
        ← All dealers
      </Link>
      <h1 className="text-xl font-bold text-white mb-6">Add dealer (manual)</h1>

      {err && (
        <div className="mb-4 bg-red-900/20 border border-red-900 text-red-300 text-sm px-4 py-2.5 rounded-lg">{err}</div>
      )}

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>HD Dealer ID *</label>
          <input className={inputClass} value={hdDealerId} onChange={(e) => setHdDealerId(e.target.value)} placeholder="e.g. 0229 or MANUAL-001" />
          <p className="text-zinc-600 text-[11px] mt-1">Must be unique. Use MANUAL- prefix for non-HD records.</p>
        </div>
        <div>
          <label className={labelClass}>Name *</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Street</label>
          <input className={inputClass} value={address1} onChange={(e) => setAddress1(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>State</label>
            <input className={inputClass} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Zip</label>
            <input className={inputClass} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Country</label>
            <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Website</label>
          <input className={inputClass} value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/admin/dealers" className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</Link>
        <button
          onClick={onCreate}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:bg-zinc-700"
        >
          {saving ? 'Creating…' : 'Create dealer'}
        </button>
      </div>
    </div>
  )
}
