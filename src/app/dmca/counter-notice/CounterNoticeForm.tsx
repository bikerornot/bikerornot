'use client'

import { useState } from 'react'
import { submitCounterNotice } from '@/app/actions/dmca'

interface Props {
  prefillName?: string
  prefillEmail?: string
  prefillUrl?: string
}

export default function CounterNoticeForm({ prefillName = '', prefillEmail = '', prefillUrl = '' }: Props) {
  const [form, setForm] = useState({
    fullName: prefillName,
    email: prefillEmail,
    address: '',
    phone: '',
    removedContentDescription: '',
    originalUrl: prefillUrl,
    goodFaithStatement: false,
    jurisdictionConsent: false,
    electronicSignature: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const signatureMatch = form.electronicSignature.trim().toLowerCase() === form.fullName.trim().toLowerCase()
  const canSubmit =
    form.fullName.trim() &&
    form.email.trim() &&
    form.address.trim() &&
    form.removedContentDescription.trim() &&
    form.originalUrl.trim() &&
    form.goodFaithStatement &&
    form.jurisdictionConsent &&
    signatureMatch

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await submitCounterNotice({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        phone: form.phone.trim() || undefined,
        removedContentDescription: form.removedContentDescription.trim(),
        originalUrl: form.originalUrl.trim(),
        goodFaithStatement: form.goodFaithStatement,
        jurisdictionConsent: form.jurisdictionConsent,
        electronicSignature: form.electronicSignature.trim(),
      })
      setDone(true)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-8 text-center">
        <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-white font-bold text-xl mb-2">Counter-Notice Received</h2>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
          Your counter-notice has been submitted and will be reviewed by our team.
          Under 17 U.S.C. § 512(g)(3), we are required to forward your counter-notice to the
          original complainant. If they do not file a court action within 10–14 business days,
          your content may be restored.
        </p>
        <p className="text-zinc-500 text-xs mt-4">
          We will contact you at <span className="text-zinc-300">{form.email}</span> with any updates.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* What is a counter-notice? */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h2 className="text-white font-semibold mb-2">What is a DMCA counter-notice?</h2>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Under 17 U.S.C. § 512(g), if you believe your content was removed due to mistake or
          misidentification, you may submit a counter-notice. Once received, we will forward it
          to the person who filed the original takedown. They then have 10–14 business days to
          file a court action; if they do not, we may restore your content.
        </p>
        <p className="text-amber-400 text-xs mt-3 font-medium">
          ⚠ This statement is made under penalty of perjury. Only submit if you have a good-faith
          belief the removal was a mistake.
        </p>
      </div>

      {/* Section 1: Contact information */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wide">1. Your Contact Information</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-xs mb-1.5">Full legal name *</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1.5">Email address *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="jane@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 text-xs mb-1.5">Mailing address *</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            required
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="123 Main St, City, State ZIP, Country"
          />
        </div>

        <div>
          <label className="block text-zinc-400 text-xs mb-1.5">Phone number (optional)</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="+1 (555) 000-0000"
          />
        </div>
      </div>

      {/* Section 2: Removed content */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wide">2. The Removed Content</h3>

        <div>
          <label className="block text-zinc-400 text-xs mb-1.5">
            URL of the removed content *
          </label>
          <input
            type="text"
            value={form.originalUrl}
            onChange={(e) => set('originalUrl', e.target.value)}
            required
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="https://bikerornot.com/posts/..."
          />
        </div>

        <div>
          <label className="block text-zinc-400 text-xs mb-1.5">
            Description of the content and why it was yours to post *
          </label>
          <textarea
            value={form.removedContentDescription}
            onChange={(e) => set('removedContentDescription', e.target.value)}
            required
            rows={4}
            placeholder="Describe the content that was removed and explain why you had the right to post it (e.g., you are the original creator, you have a license, etc.)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          />
        </div>
      </div>

      {/* Section 3: Sworn statements */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wide">3. Sworn Statements</h3>

        <label className="flex gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={form.goodFaithStatement}
            onChange={(e) => set('goodFaithStatement', e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-orange-500 flex-shrink-0"
          />
          <span className="text-zinc-300 text-sm leading-relaxed">
            I have a good-faith belief that the content was removed or disabled as a result of
            mistake or misidentification of the material to be removed or disabled. *
          </span>
        </label>

        <label className="flex gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={form.jurisdictionConsent}
            onChange={(e) => set('jurisdictionConsent', e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-orange-500 flex-shrink-0"
          />
          <span className="text-zinc-300 text-sm leading-relaxed">
            I consent to the jurisdiction of the Federal District Court for the judicial district
            in which my address is located, or if my address is outside the United States, to
            any judicial district in which BikerOrNot may be found. I agree to accept service of
            process from the person who provided the original takedown notice. *
          </span>
        </label>
      </div>

      {/* Section 4: Electronic signature */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wide">4. Electronic Signature</h3>
        <p className="text-zinc-500 text-xs">
          Type your full legal name exactly as entered above to sign this counter-notice under penalty of perjury.
        </p>
        <input
          type="text"
          value={form.electronicSignature}
          onChange={(e) => set('electronicSignature', e.target.value)}
          required
          className={`w-full bg-zinc-800 border rounded-lg px-3 py-2.5 text-white text-sm italic placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 ${
            form.electronicSignature && !signatureMatch
              ? 'border-red-500/60'
              : 'border-zinc-700'
          }`}
          placeholder="Type your full name to sign"
        />
        {form.electronicSignature && !signatureMatch && (
          <p className="text-red-400 text-xs">Signature must match your full name above.</p>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold py-3.5 rounded-xl transition-colors text-sm"
      >
        {submitting ? 'Submitting…' : 'Submit Counter-Notice'}
      </button>

      <p className="text-zinc-600 text-xs text-center leading-relaxed">
        By submitting this counter-notice, you acknowledge that it is made under penalty of perjury
        and that you consent to its forwarding to the original complainant per 17 U.S.C. § 512(g)(3).
      </p>
    </form>
  )
}
