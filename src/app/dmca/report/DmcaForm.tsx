'use client'

import { useState } from 'react'
import Link from 'next/link'
import { submitDmcaNotice } from '@/app/actions/dmca'

export default function DmcaForm() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    address: '',
    phone: '',
    relationship: 'owner' as 'owner' | 'authorized_rep',
    workDescription: '',
    infringingUrls: '',
    goodFaithBelief: false,
    accuracyStatement: false,
    electronicSignature: '',
  })

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.fullName || !form.email || !form.address || !form.workDescription || !form.infringingUrls || !form.electronicSignature) {
      setError('Please complete all required fields.')
      return
    }
    if (!form.goodFaithBelief || !form.accuracyStatement) {
      setError('You must check both attestation boxes to submit a valid DMCA notice.')
      return
    }
    if (form.electronicSignature.trim().toLowerCase() !== form.fullName.trim().toLowerCase()) {
      setError('Your electronic signature must match your full name exactly.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await submitDmcaNotice(form)
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again or email dmca@bikerornot.com directly.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-10 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-white mb-2">Notice Received</h2>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
          Your DMCA takedown notice has been submitted and assigned a case number. Our team will
          review it and respond to <span className="text-white">{form.email}</span> within 5 business days.
        </p>
        <p className="text-zinc-600 text-xs mt-6">
          Questions? Email{' '}
          <a href="mailto:dmca@bikerornot.com" className="text-orange-400 hover:text-orange-300">
            dmca@bikerornot.com
          </a>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">

      {/* Contact information */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-zinc-800">
          1. Your Contact Information
        </h2>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Full legal name <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email address <span className="text-orange-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="jane@example.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Mailing address <span className="text-orange-500">*</span>
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="123 Main St, City, State, ZIP, Country"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Phone number <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Your relationship to the copyrighted work <span className="text-orange-500">*</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="relationship"
                  checked={form.relationship === 'owner'}
                  onChange={() => set('relationship', 'owner')}
                  className="w-4 h-4 text-orange-500 border-zinc-600 focus:ring-orange-500 bg-zinc-800"
                />
                <span className="text-sm text-zinc-300">I am the copyright owner</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="relationship"
                  checked={form.relationship === 'authorized_rep'}
                  onChange={() => set('relationship', 'authorized_rep')}
                  className="w-4 h-4 text-orange-500 border-zinc-600 focus:ring-orange-500 bg-zinc-800"
                />
                <span className="text-sm text-zinc-300">I am authorized to act on behalf of the copyright owner</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Copyrighted work */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-zinc-800">
          2. The Copyrighted Work
        </h2>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Description of your copyrighted work <span className="text-orange-500">*</span>
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            Describe what was copied — e.g., "a photograph I took of my motorcycle at Sturgis 2024" or
            "text from my blog post titled '…'". Include any registration numbers if applicable.
          </p>
          <textarea
            value={form.workDescription}
            onChange={(e) => set('workDescription', e.target.value)}
            rows={4}
            placeholder="Describe the original copyrighted work that has been infringed…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none"
          />
        </div>
      </section>

      {/* Infringing content */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-zinc-800">
          3. The Infringing Content
        </h2>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            URL(s) of the infringing content on BikerOrNot <span className="text-orange-500">*</span>
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            Provide the direct URL(s) to the specific post, photo, or profile page containing the
            infringing material. Enter one URL per line.
          </p>
          <textarea
            value={form.infringingUrls}
            onChange={(e) => set('infringingUrls', e.target.value)}
            rows={4}
            placeholder="https://bikerornot.com/posts/abc123&#10;https://bikerornot.com/profile/username"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none font-mono"
          />
        </div>
      </section>

      {/* Attestations */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-zinc-800">
          4. Legal Attestations
        </h2>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={form.goodFaithBelief}
              onChange={(e) => set('goodFaithBelief', e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500 flex-shrink-0"
            />
            <span className="text-sm text-zinc-300 leading-relaxed">
              <span className="text-orange-500">*</span>{' '}
              I have a good faith belief that the use of the material in the manner complained of is not
              authorized by the copyright owner, its agent, or the law.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={form.accuracyStatement}
              onChange={(e) => set('accuracyStatement', e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500 flex-shrink-0"
            />
            <span className="text-sm text-zinc-300 leading-relaxed">
              <span className="text-orange-500">*</span>{' '}
              I swear, <strong className="text-white">under penalty of perjury</strong>, that the
              information in this notification is accurate and that I am the copyright owner or am
              authorized to act on behalf of the owner of an exclusive right that is allegedly infringed.
            </span>
          </label>
        </div>
      </section>

      {/* Electronic signature */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 pb-2 border-b border-zinc-800">
          5. Electronic Signature
        </h2>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Type your full legal name to sign <span className="text-orange-500">*</span>
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            Must match the name you entered in Section 1. This constitutes your electronic signature
            under the DMCA.
          </p>
          <input
            type="text"
            value={form.electronicSignature}
            onChange={(e) => set('electronicSignature', e.target.value)}
            placeholder="Your full legal name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm italic"
          />
        </div>
      </section>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit DMCA Takedown Notice'}
        </button>
        <p className="text-center text-xs text-zinc-600 mt-3">
          By submitting this form you agree that the information provided is accurate.
          Knowingly submitting a false claim may expose you to liability under 17 U.S.C. § 512(f).
        </p>
      </div>

    </form>
  )
}
