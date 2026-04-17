'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  updateDealer,
  deleteDealer,
  createContact,
  updateContact,
  deleteContact,
  type HdDealer,
  type HdDealerContact,
} from '@/app/actions/hd-dealers'

const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors'
const labelClass = 'block text-xs text-zinc-500 mb-1'

interface Props {
  initialDealer: HdDealer
  initialContacts: HdDealerContact[]
}

const VERIFICATION_OPTIONS: HdDealerContact['verification_status'][] = [
  'unverified',
  'verified',
  'stale',
  'bounced',
]

const TITLE_PRESETS = [
  { label: '— select —', value: '' },
  { label: 'General Manager', value: 'General Manager' },
  { label: 'General Sales Manager', value: 'General Sales Manager' },
  { label: 'Sales Manager', value: 'Sales Manager' },
  { label: 'Service Manager', value: 'Service Manager' },
  { label: 'Parts Manager', value: 'Parts Manager' },
  { label: 'F&I Manager', value: 'F&I Manager' },
  { label: 'Marketing Manager', value: 'Marketing Manager' },
  { label: 'eCommerce Contact', value: 'eCommerce Contact' },
  { label: 'Owner', value: 'Owner' },
]

function normalizeTitle(title: string | null): string | null {
  if (!title) return null
  return title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function DealerDetailClient({ initialDealer, initialContacts }: Props) {
  const router = useRouter()
  const [dealer, setDealer] = useState<HdDealer>(initialDealer)
  const [contacts, setContacts] = useState<HdDealerContact[]>(initialContacts)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showNewContact, setShowNewContact] = useState(false)

  function update<K extends keyof HdDealer>(key: K, value: HdDealer[K]) {
    setDealer((d) => ({ ...d, [key]: value }))
  }

  async function onSave() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await updateDealer(dealer.id, {
        name: dealer.name,
        dba_name: dealer.dba_name,
        address1: dealer.address1,
        city: dealer.city,
        state: dealer.state,
        postal_code: dealer.postal_code,
        country: dealer.country,
        phone: dealer.phone,
        fax: dealer.fax,
        email: dealer.email,
        website: dealer.website,
        latitude: dealer.latitude,
        longitude: dealer.longitude,
        hours_raw: dealer.hours_raw,
        is_active: dealer.is_active,
        last_verified_at: new Date().toISOString(),
      })
      setSuccess('Saved')
      setTimeout(() => setSuccess(''), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    setSaving(true)
    try {
      await deleteDealer(dealer.id)
      router.push('/admin/dealers')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/admin/dealers"
            className="text-zinc-500 hover:text-zinc-300 text-sm inline-flex items-center gap-1 mb-2"
          >
            ← All dealers
          </Link>
          <h1 className="text-xl font-bold text-white">{dealer.name}</h1>
          <p className="text-zinc-500 text-xs mt-1 font-mono">
            HD ID {dealer.hd_dealer_id}
            {dealer.hd_auth_code && ` · auth ${dealer.hd_auth_code}`}
            {' · '}Source: {dealer.source}
            {dealer.last_scraped_at && ` · Last scraped ${new Date(dealer.last_scraped_at).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg border border-red-900 hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors disabled:bg-zinc-700"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-900 text-red-300 text-sm px-4 py-2.5 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-emerald-900/20 border border-emerald-900 text-emerald-300 text-sm px-4 py-2.5 rounded-lg">{success}</div>
      )}

      {/* Dealer form */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="text-white text-sm font-semibold mb-4">Dealer information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Name</label>
            <input className={inputClass} value={dealer.name ?? ''} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>DBA name</label>
            <input className={inputClass} value={dealer.dba_name ?? ''} onChange={(e) => update('dba_name', e.target.value || null)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Street</label>
            <input className={inputClass} value={dealer.address1 ?? ''} onChange={(e) => update('address1', e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input className={inputClass} value={dealer.city ?? ''} onChange={(e) => update('city', e.target.value || null)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>State</label>
              <input className={inputClass} value={dealer.state ?? ''} onChange={(e) => update('state', e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>Zip</label>
              <input className={inputClass} value={dealer.postal_code ?? ''} onChange={(e) => update('postal_code', e.target.value || null)} />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} value={dealer.country ?? ''} onChange={(e) => update('country', e.target.value || null)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={dealer.phone ?? ''} onChange={(e) => update('phone', e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>Fax</label>
            <input className={inputClass} value={dealer.fax ?? ''} onChange={(e) => update('fax', e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input className={inputClass} value={dealer.email ?? ''} onChange={(e) => update('email', e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>Website</label>
            <input className={inputClass} value={dealer.website ?? ''} onChange={(e) => update('website', e.target.value || null)} />
          </div>
          <div>
            <label className={labelClass}>Latitude</label>
            <input
              className={inputClass}
              type="number"
              step="0.000001"
              value={dealer.latitude ?? ''}
              onChange={(e) => update('latitude', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
          <div>
            <label className={labelClass}>Longitude</label>
            <input
              className={inputClass}
              type="number"
              step="0.000001"
              value={dealer.longitude ?? ''}
              onChange={(e) => update('longitude', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Hours (HTML from HD or plain text)</label>
            <textarea
              className={`${inputClass} font-mono text-xs h-32`}
              value={dealer.hours_raw ?? ''}
              onChange={(e) => update('hours_raw', e.target.value || null)}
            />
            {dealer.hours_raw && (
              <div
                className="mt-2 text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded p-3"
                dangerouslySetInnerHTML={{ __html: dealer.hours_raw }}
              />
            )}
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={dealer.is_active}
                onChange={(e) => update('is_active', e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500"
              />
              Active (appears in HD&apos;s locator)
            </label>
          </div>
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-sm font-semibold">Contacts ({contacts.length})</h2>
          <button
            onClick={() => setShowNewContact(true)}
            className="text-sm text-orange-400 hover:text-orange-300 inline-flex items-center gap-1"
          >
            + Add contact
          </button>
        </div>

        {showNewContact && (
          <NewContactRow
            dealerId={dealer.id}
            onCancel={() => setShowNewContact(false)}
            onCreated={(c) => {
              setContacts((prev) => [...prev, c])
              setShowNewContact(false)
            }}
          />
        )}

        {contacts.length === 0 && !showNewContact && (
          <p className="text-zinc-500 text-sm py-4 text-center">No contacts yet.</p>
        )}
        <div className="space-y-2">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              onChange={(updated) =>
                setContacts((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
              onDelete={(id) => setContacts((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      </div>

      {/* Raw data */}
      <details className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <summary className="text-zinc-400 text-sm cursor-pointer">Raw HD payload &amp; extras</summary>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <RawBlock label="commerce_info" data={dealer.commerce_info} />
          <RawBlock label="hog_info" data={dealer.hog_info} />
          <RawBlock label="riders_edge_info" data={dealer.riders_edge_info} />
          <RawBlock label="test_ride_info" data={dealer.test_ride_info} />
          <RawBlock label="offerings" data={dealer.offerings} />
          <RawBlock label="program_codes" data={dealer.program_codes} />
        </div>
      </details>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">Delete this dealer?</h3>
            <p className="text-zinc-400 text-sm mb-5">
              Removes the dealer and all its contacts. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm disabled:bg-zinc-700"
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

function RawBlock({ label, data }: { label: string; data: unknown }) {
  if (!data) return null
  return (
    <div>
      <div className="text-zinc-500 uppercase tracking-wide text-[10px] mb-1">{label}</div>
      <pre className="bg-zinc-950 border border-zinc-800 rounded p-2 overflow-x-auto text-zinc-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function NewContactRow({
  dealerId,
  onCreated,
  onCancel,
}: {
  dealerId: string
  onCreated: (c: HdDealerContact) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function onCreate() {
    if (!name.trim()) { setErr('Name required'); return }
    setSaving(true)
    setErr('')
    try {
      const created = await createContact(dealerId, {
        name: name.trim(),
        title: title || null,
        title_normalized: normalizeTitle(title),
        email: email || null,
        phone_direct: phone || null,
        linkedin_url: linkedin || null,
        notes: notes || null,
        source: 'manual',
      })
      onCreated(created)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 mb-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        <input className={inputClass} placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)}>
          {TITLE_PRESETS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input className={inputClass} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputClass} placeholder="Direct phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={inputClass} placeholder="LinkedIn URL" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
        <input className={inputClass} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {err && <div className="text-red-400 text-xs mb-2">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-sm text-zinc-400 hover:text-white px-3 py-1">Cancel</button>
        <button
          onClick={onCreate}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1 rounded disabled:bg-zinc-700"
        >
          {saving ? 'Saving…' : 'Add contact'}
        </button>
      </div>
    </div>
  )
}

function ContactRow({
  contact,
  onChange,
  onDelete,
}: {
  contact: HdDealerContact
  onChange: (c: HdDealerContact) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<HdDealerContact>(contact)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function onSave() {
    setSaving(true)
    setErr('')
    try {
      await updateContact(contact.id, {
        name: draft.name,
        title: draft.title,
        title_normalized: normalizeTitle(draft.title),
        email: draft.email,
        phone_direct: draft.phone_direct,
        phone_mobile: draft.phone_mobile,
        linkedin_url: draft.linkedin_url,
        verification_status: draft.verification_status,
        is_active: draft.is_active,
        notes: draft.notes,
        last_verified_at: draft.verification_status === 'verified' ? new Date().toISOString() : draft.last_verified_at,
      })
      onChange(draft)
      setEditing(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteConfirm() {
    setSaving(true)
    try {
      await deleteContact(contact.id)
      onDelete(contact.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="border border-zinc-800 rounded-lg p-3 flex items-start justify-between gap-3 bg-zinc-950/50">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-medium">{contact.name}</span>
            {contact.title && <span className="text-zinc-400 text-sm">{contact.title}</span>}
            <span
              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                contact.verification_status === 'verified'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : contact.verification_status === 'bounced'
                  ? 'bg-red-500/15 text-red-400'
                  : contact.verification_status === 'stale'
                  ? 'bg-yellow-500/15 text-yellow-400'
                  : 'bg-zinc-700 text-zinc-300'
              }`}
            >
              {contact.verification_status}
            </span>
            <span className="text-zinc-600 text-xs">via {contact.source ?? 'unknown'}</span>
          </div>
          <div className="text-zinc-400 text-sm mt-1 space-y-0.5">
            {contact.email && <div>✉ {contact.email}</div>}
            {contact.phone_direct && <div>☎ {contact.phone_direct}</div>}
            {contact.linkedin_url && (
              <div>
                <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline text-xs">
                  LinkedIn ↗
                </a>
              </div>
            )}
            {contact.notes && <div className="text-zinc-500 italic">{contact.notes}</div>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-800"
          >
            Edit
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-zinc-800"
          >
            Delete
          </button>
        </div>
        {confirmingDelete && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmingDelete(false)}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-white font-semibold mb-2">Delete contact {contact.name}?</h3>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setConfirmingDelete(false)} className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm">Cancel</button>
                <button onClick={onDeleteConfirm} disabled={saving} className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm disabled:bg-zinc-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
        <input className={inputClass} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <select className={inputClass} value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value || null })}>
          {TITLE_PRESETS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
          {draft.title && !TITLE_PRESETS.some((t) => t.value === draft.title) && (
            <option value={draft.title}>{draft.title}</option>
          )}
        </select>
        <input className={inputClass} placeholder="Email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value || null })} />
        <input className={inputClass} placeholder="Direct phone" value={draft.phone_direct ?? ''} onChange={(e) => setDraft({ ...draft, phone_direct: e.target.value || null })} />
        <input className={inputClass} placeholder="Mobile" value={draft.phone_mobile ?? ''} onChange={(e) => setDraft({ ...draft, phone_mobile: e.target.value || null })} />
        <input className={inputClass} placeholder="LinkedIn URL" value={draft.linkedin_url ?? ''} onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value || null })} />
        <select
          className={inputClass}
          value={draft.verification_status}
          onChange={(e) => setDraft({ ...draft, verification_status: e.target.value as HdDealerContact['verification_status'] })}
        >
          {VERIFICATION_OPTIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500"
          />
          Active
        </label>
        <input className={`${inputClass} md:col-span-2`} placeholder="Notes" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })} />
      </div>
      {err && <div className="text-red-400 text-xs mb-2">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { setDraft(contact); setEditing(false) }} className="text-sm text-zinc-400 hover:text-white px-3 py-1">Cancel</button>
        <button onClick={onSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1 rounded disabled:bg-zinc-700">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
