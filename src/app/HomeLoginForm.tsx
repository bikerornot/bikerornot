'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function HomeLoginForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    const supabase = createClient()
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
    router.push(profile?.onboarding_complete ? '/feed' : '/onboarding')
    router.refresh()
  }

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 shadow-2xl">
      <h2 className="text-xl font-bold text-white mb-1">Welcome back</h2>
      <p className="text-zinc-500 text-sm mb-6">Sign in to your account</p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            placeholder="jane@example.com"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-zinc-300">Password</label>
            <Link href="/forgot-password" className="text-xs text-orange-400 hover:text-orange-300 transition-colors">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            autoComplete="current-password"
            placeholder="Your password"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
          />
        </div>

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

      <div className="mt-6 pt-5 border-t border-zinc-800 text-center">
        <p className="text-zinc-500 text-sm">
          New to BikerOrNot?{' '}
          <Link href="/signup" className="text-orange-400 hover:text-orange-300 font-semibold transition-colors">
            Create a free account
          </Link>
        </p>
      </div>
    </div>
  )
}
