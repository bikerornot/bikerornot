'use client'

import { useState, useRef, useEffect } from 'react'
import { requestPhoneVerification, checkPhoneVerification } from '@/app/actions/phone-verification'

interface Props {
  onVerified: () => void
  onCancel?: () => void
}

export default function PhoneVerifyForm({ onVerified, onCancel }: Props) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code' | 'success'>('phone')
  const [sending, setSending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'code') {
      codeInputRef.current?.focus()
    }
  }, [step])

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  async function handleSendCode() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setError('Please enter a 10-digit phone number.')
      return
    }

    setSending(true)
    setError(null)
    try {
      const result = await requestPhoneVerification(digits)
      if ('error' in result) {
        setError(result.error)
      } else {
        setStep('code')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code.')
    } finally {
      setSending(false)
    }
  }

  async function handleVerify() {
    if (code.length !== 6) {
      setError('Please enter the 6-digit code.')
      return
    }

    setChecking(true)
    setError(null)
    try {
      const result = await checkPhoneVerification(code)
      if (result.verified) {
        setStep('success')
        setTimeout(onVerified, 3000)
      } else {
        setError(result.message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
    } finally {
      setChecking(false)
    }
  }

  async function handleResend() {
    setCode('')
    setError(null)
    await handleSendCode()
  }

  if (step === 'success') {
    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-white font-semibold text-lg">Phone verified!</p>
        <p className="text-zinc-400 text-sm mt-1">Your account is now verified.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-zinc-400 text-sm leading-relaxed">
        To keep our community safe, we verify phone numbers for new accounts.
        Your number is private and will never be shared.
      </p>

      {step === 'phone' && (
        <>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Mobile phone number
            </label>
            <div className="flex gap-2">
              <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg px-3 text-zinc-400 text-base flex-shrink-0">
                +1
              </div>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(formatPhone(e.target.value))
                  setError(null)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode() }}
                placeholder="(555) 123-4567"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSendCode}
            disabled={sending || phone.replace(/\D/g, '').length !== 10}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-base"
          >
            {sending ? 'Sending code...' : 'Send verification code'}
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Enter the 6-digit code sent to your phone
            </label>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(digits)
                setError(null)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) handleVerify() }}
              placeholder="000000"
              maxLength={6}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base text-center tracking-[0.3em] font-mono text-xl"
            />
          </div>

          <button
            type="button"
            onClick={handleVerify}
            disabled={checking || code.length !== 6}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-base"
          >
            {checking ? 'Verifying...' : 'Verify'}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleResend}
              disabled={sending}
              className="text-sm text-orange-400 hover:text-orange-300 transition-colors disabled:text-zinc-600"
            >
              {sending ? 'Sending...' : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setCode(''); setError(null) }}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Change number
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {onCancel && step === 'phone' && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full text-zinc-500 hover:text-zinc-300 text-sm transition-colors py-2"
        >
          Skip for now
        </button>
      )}
    </div>
  )
}
