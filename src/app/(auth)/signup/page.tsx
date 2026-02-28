'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { checkEmail } from '@/app/actions/auth'

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const RELATIONSHIP_OPTIONS = [
  { value: 'single', label: '🟢 Single' },
  { value: 'in_a_relationship', label: '💑 In a Relationship' },
  { value: 'its_complicated', label: "🤷 It's Complicated" },
]

function getMinDOB() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().split('T')[0]
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character'
  return null
}

function validateZipCode(zip: string): boolean {
  return /^\d{5}$/.test(zip) || /^\d{5}-\d{4}$/.test(zip) || /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(zip)
}

export default function SignupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    dob: '',
    zipCode: '',
    gender: '',
    relationshipStatus: '',
  })

  function handleDOBChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
    } else if (digits.length > 2) {
      formatted = digits.slice(0, 2) + '/' + digits.slice(2)
    }
    set('dob', formatted)
  }

  function getDOB() {
    const parts = form.dob.split('/')
    if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) return ''
    return `${parts[2]}-${parts[0]}-${parts[1]}`
  }

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => ({ ...prev, [field]: '' }))
    setError(null)
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}

    if (!form.firstName.trim()) errors.firstName = 'First name is required'
    else if (form.firstName.trim().length > 50) errors.firstName = 'Max 50 characters'

    if (!form.lastName.trim()) errors.lastName = 'Last name is required'
    else if (form.lastName.trim().length > 50) errors.lastName = 'Max 50 characters'

    if (!form.email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email'

    const pwdError = validatePassword(form.password)
    if (pwdError) errors.password = pwdError

    if (!form.confirmPassword) errors.confirmPassword = 'Please confirm your password'
    else if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match'

    const dob = getDOB()
    if (!dob) {
      errors.dateOfBirth = 'Enter your date of birth as MM/DD/YYYY'
    } else {
      const parsed = new Date(dob)
      if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob) {
        errors.dateOfBirth = 'Please enter a valid date'
      } else if (dob > getMinDOB()) {
        errors.dateOfBirth = 'You must be at least 18 years old to register'
      }
    }

    if (!form.zipCode.trim()) {
      errors.zipCode = 'Zip code is required'
    } else if (!validateZipCode(form.zipCode.trim())) {
      errors.zipCode = 'Enter a valid US or international zip/postal code'
    }

    if (!form.gender) errors.gender = 'Please select your gender'

    if (!form.relationshipStatus) errors.relationshipStatus = 'Please select a relationship status'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setError(null)

    // Store email for resend flow on verify-email page
    sessionStorage.setItem('signup_email', form.email.trim())

    const { disposable } = await checkEmail(form.email.trim())
    if (disposable) {
      setFieldErrors({ email: 'Please use a permanent email address. Temporary or disposable emails are not allowed.' })
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          date_of_birth: getDOB(),
          zip_code: form.zipCode.trim(),
          gender: form.gender,
          relationship_status: form.relationshipStatus,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    router.push('/verify-email')
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-8 shadow-2xl border border-zinc-800">
      <h2 className="text-xl font-semibold text-white mb-6">Create your account</h2>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">First name</label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              maxLength={50}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              placeholder="Jane"
            />
            {fieldErrors.firstName && <p className="text-red-400 text-xs mt-1">{fieldErrors.firstName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Last name</label>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              maxLength={50}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              placeholder="Rider"
            />
            {fieldErrors.lastName && <p className="text-red-400 text-xs mt-1">{fieldErrors.lastName}</p>}
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Email address</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="jane@example.com"
          />
          {fieldErrors.email && <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special"
          />
          {fieldErrors.password && <p className="text-red-400 text-xs mt-1">{fieldErrors.password}</p>}
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Confirm password</label>
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => set('confirmPassword', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="Repeat your password"
          />
          {fieldErrors.confirmPassword && <p className="text-red-400 text-xs mt-1">{fieldErrors.confirmPassword}</p>}
        </div>

        {/* Date of birth */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Date of birth</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.dob}
            onChange={handleDOBChange}
            placeholder="MM/DD/YYYY"
            maxLength={10}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base"
          />
          {fieldErrors.dateOfBirth && <p className="text-red-400 text-xs mt-1">{fieldErrors.dateOfBirth}</p>}
        </div>

        {/* Zip code */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Zip / Postal code</label>
          <input
            type="text"
            value={form.zipCode}
            onChange={(e) => set('zipCode', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="90210"
          />
          {fieldErrors.zipCode && <p className="text-red-400 text-xs mt-1">{fieldErrors.zipCode}</p>}
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Gender</label>
          <div className="grid grid-cols-2 gap-2">
            {GENDER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  form.gender === opt.value
                    ? 'border-orange-500 bg-orange-500/10 text-white'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <input
                  type="radio"
                  name="gender"
                  value={opt.value}
                  checked={form.gender === opt.value}
                  onChange={(e) => set('gender', e.target.value)}
                  className="sr-only"
                />
                <span className="text-sm font-medium">{opt.label}</span>
              </label>
            ))}
          </div>
          {fieldErrors.gender && <p className="text-red-400 text-xs mt-1">{fieldErrors.gender}</p>}
        </div>

        {/* Relationship status */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Relationship status</label>
          <div className="space-y-2">
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  form.relationshipStatus === opt.value
                    ? 'border-orange-500 bg-orange-500/10 text-white'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <input
                  type="radio"
                  name="relationshipStatus"
                  value={opt.value}
                  checked={form.relationshipStatus === opt.value}
                  onChange={(e) => set('relationshipStatus', e.target.value)}
                  className="sr-only"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
          {fieldErrors.relationshipStatus && (
            <p className="text-red-400 text-xs mt-1">{fieldErrors.relationshipStatus}</p>
          )}
        </div>

        {/* Global error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-400 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-orange-400 hover:text-orange-300 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  )
}
