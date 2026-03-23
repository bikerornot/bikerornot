const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!

function authHeader() {
  return 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')
}

/** Lookup a phone number — returns carrier type. Rejects VoIP numbers. */
export async function lookupPhoneNumber(phoneNumber: string): Promise<{
  valid: boolean
  carrierType: string | null
}> {
  const res = await fetch(
    `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}?Fields=line_type_intelligence`,
    { headers: { Authorization: authHeader() } }
  )

  if (!res.ok) {
    if (res.status === 404) return { valid: false, carrierType: null }
    throw new Error(`Twilio Lookup failed: ${res.status}`)
  }

  const data = await res.json()
  const carrierType = data.line_type_intelligence?.type ?? null
  return { valid: data.valid, carrierType }
}

/** Send a 6-digit verification code via SMS. */
export async function sendVerificationCode(phoneNumber: string): Promise<{
  sid: string
  status: string
}> {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${VERIFY_SID}/Verifications`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phoneNumber, Channel: 'sms' }),
    }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Twilio Verify send failed: ${res.status}`)
  }

  const data = await res.json()
  return { sid: data.sid, status: data.status }
}

/** Check a verification code. Returns whether the code is valid. */
export async function checkVerificationCode(
  phoneNumber: string,
  code: string
): Promise<{ valid: boolean; status: string }> {
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phoneNumber, Code: code }),
    }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Twilio Verify check failed: ${res.status}`)
  }

  const data = await res.json()
  return { valid: data.status === 'approved', status: data.status }
}
