'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { lookupPhoneNumber, sendVerificationCode, checkVerificationCode } from '@/lib/twilio'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Normalize a phone number to E.164 format. US-only for now. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`
  throw new Error('Please enter a valid 10-digit US phone number.')
}

export async function requestPhoneVerification(
  phoneNumber: string
): Promise<{ sent: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`phoneVerify:${user.id}`, 3, 3_600_000)

  let normalized: string
  try {
    normalized = normalizePhone(phoneNumber)
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Invalid phone number.' }
  }

  // Check carrier type — reject VoIP
  try {
    const lookup = await lookupPhoneNumber(normalized)
    if (!lookup.valid) {
      return { error: 'This does not appear to be a valid phone number.' }
    }
    if (lookup.carrierType === 'voip') {
      return { error: 'VoIP numbers are not accepted. Please use a mobile phone number.' }
    }
  } catch {
    // If lookup fails, allow the verification to proceed
  }

  const admin = getServiceClient()

  // Check uniqueness — reject if verified on another account OR used by a banned account
  const { data: existing } = await admin
    .from('profiles')
    .select('id, status, phone_verified_at')
    .eq('phone_number', normalized)
    .neq('id', user.id)

  const blocked = (existing ?? []).some(
    (p) => p.phone_verified_at !== null || p.status === 'banned'
  )
  if (blocked) {
    return { error: 'This phone number is already verified on another account.' }
  }

  // Store the number (unverified) so checkPhoneVerification knows what to verify
  await admin
    .from('profiles')
    .update({ phone_number: normalized })
    .eq('id', user.id)

  // Send verification code
  try {
    await sendVerificationCode(normalized)
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to send verification code.' }
  }

  return { sent: true }
}

export async function checkPhoneVerification(
  code: string
): Promise<{ verified: true } | { verified: false; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`phoneCheck:${user.id}`, 5, 3_600_000)

  if (!/^\d{6}$/.test(code)) {
    return { verified: false, message: 'Please enter the 6-digit code.' }
  }

  const admin = getServiceClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('phone_number')
    .eq('id', user.id)
    .single()

  if (!profile?.phone_number) {
    return { verified: false, message: 'No phone number found. Please request a new code.' }
  }

  const result = await checkVerificationCode(profile.phone_number, code)

  if (!result.valid) {
    return { verified: false, message: 'Incorrect code. Please try again.' }
  }

  await admin
    .from('profiles')
    .update({
      phone_verified_at: new Date().toISOString(),
      phone_verification_required: false,
    })
    .eq('id', user.id)

  return { verified: true }
}

export async function removePhoneVerification(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Don't let banned users remove their phone — keeps the number locked
  const { data: profile } = await admin
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .single()
  if (profile?.status === 'banned') throw new Error('Cannot remove phone verification.')

  await admin
    .from('profiles')
    .update({ phone_number: null, phone_verified_at: null })
    .eq('id', user.id)
}
