'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function VerifyEmailPage() {
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleResend() {
    setResending(true)
    setError(null)

    // We can't easily get the email from a server-side session at this point,
    // so we prompt via the forgot-password flow as a fallback.
    // In practice, most users will just check their email.
    // A full resend requires the email to be stored in sessionStorage from signup.
    const email = sessionStorage.getItem('signup_email')
    if (!email) {
      setError('Could not resend — please try signing up again or use the forgot password flow.')
      setResending(false)
      return
    }

    const supabase = createClient()
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (resendError) {
      setError(resendError.message)
    } else {
      setResent(true)
    }

    setResending(false)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-4">📨</div>
        <h1 className="text-2xl font-bold text-white mb-2">Check your email</h1>
        <p className="text-zinc-400 mb-8">
          We sent you a verification link. Click it to activate your BikerOrNot account.
          <br />
          <span className="text-zinc-500 text-sm mt-2 block">
            Can&apos;t find it? Check your spam folder.
          </span>
        </p>

        {resent ? (
          <p className="text-green-400 text-sm mb-4">Verification email resent successfully!</p>
        ) : (
          <>
            <button
              onClick={handleResend}
              disabled={resending}
              className="text-orange-400 hover:text-orange-300 text-sm font-medium disabled:opacity-50"
            >
              {resending ? 'Resending…' : "Didn't receive it? Resend verification email"}
            </button>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </>
        )}

        <div className="mt-8 border-t border-zinc-800 pt-6">
          <Link href="/login" className="text-zinc-400 hover:text-zinc-300 text-sm">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
