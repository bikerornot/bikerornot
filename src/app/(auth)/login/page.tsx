'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rememberMe, setRememberMe] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Please enter your email and password')
      return
    }

    setLoading(true)
    setError(null)

    const supabase = createClient()

    if (rememberMe) {
      await supabase.auth.setSession({ access_token: '', refresh_token: '' }).catch(() => {})
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    })

    if (signInError) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', data.user.id)
      .single()

    if (profile && !profile.onboarding_complete) {
      router.push('/onboarding')
    } else {
      router.push(redirectTo)
    }

    router.refresh()
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-8 shadow-2xl border border-zinc-800">
      <h2 className="text-xl font-semibold text-white mb-6">Sign in to your account</h2>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Email address</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="jane@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-zinc-300">Password</label>
            <Link href="/forgot-password" className="text-xs text-orange-400 hover:text-orange-300">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            autoComplete="current-password"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
            placeholder="Your password"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-300">Remember me for 30 days</span>
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-400 mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-orange-400 hover:text-orange-300 font-medium">
          Create one
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
