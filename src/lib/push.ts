import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

// Minimal FCM HTTP v1 sender. We keep this self-contained (no
// google-auth-library, no firebase-admin) because everything we need fits
// in Node's built-in crypto + fetch: sign a JWT with the service account's
// private key, trade it for a 1-hour OAuth2 access token, POST to FCM.

interface ServiceAccount {
  project_id: string
  private_key: string
  client_email: string
}

let cachedServiceAccount: ServiceAccount | null = null
function getServiceAccount(): ServiceAccount {
  if (cachedServiceAccount) return cachedServiceAccount
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var not set')
  const json = Buffer.from(b64, 'base64').toString('utf-8')
  const parsed = JSON.parse(json) as ServiceAccount
  if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
    throw new Error('Service account JSON missing required fields')
  }
  cachedServiceAccount = parsed
  return parsed
}

interface CachedAccessToken {
  token: string
  expiresAtSeconds: number
}
let tokenCache: CachedAccessToken | null = null

// Google access tokens last 3600s. Cache until 60s before expiry so we don't
// pay the JWT + HTTP round-trip on every push send under normal traffic.
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.expiresAtSeconds - 60 > now) return tokenCache.token

  const sa = getServiceAccount()
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${enc(header)}.${enc(claim)}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  const signature = signer.sign(sa.private_key, 'base64url')
  const jwt = `${unsigned}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`FCM OAuth token exchange failed ${res.status}: ${txt}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    token: data.access_token,
    expiresAtSeconds: now + data.expires_in,
  }
  return data.access_token
}

export interface PushNotificationPayload {
  title: string
  body: string
  // FCM data keys must be strings — stringify any structured fields upstream.
  data?: Record<string, string>
}

// Send a push to every active device registered for a user. Fire-and-forget
// from the caller's perspective: individual token failures don't abort the
// fan-out, and tokens FCM reports as dead are pruned from device_tokens so
// the next send skips them. Safe to call from after() in server actions.
export async function sendPushToUser(
  userId: string,
  notification: PushNotificationPayload
): Promise<void> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: tokens } = await admin
    .from('device_tokens')
    .select('id, token')
    .eq('user_id', userId)

  if (!tokens || tokens.length === 0) return

  let accessToken: string
  let projectId: string
  try {
    accessToken = await getAccessToken()
    projectId = getServiceAccount().project_id
  } catch (err) {
    console.warn('[push] could not obtain FCM access token', err)
    return
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
  const deadTokenIds: string[] = []

  await Promise.all(
    tokens.map(async ({ id, token }) => {
      const body = {
        message: {
          token,
          notification: {
            title: notification.title,
            body: notification.body,
          },
          ...(notification.data ? { data: notification.data } : {}),
          android: { priority: 'HIGH' },
        },
      }
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
        if (res.ok) return

        const errText = await res.text()
        // FCM reports dead tokens with 404 UNREGISTERED or 400
        // INVALID_ARGUMENT (token malformed) / SENDER_ID_MISMATCH (wrong
        // Firebase project). All three mean "don't try again."
        if (
          res.status === 404 ||
          /UNREGISTERED|INVALID_ARGUMENT|SENDER_ID_MISMATCH/i.test(errText)
        ) {
          deadTokenIds.push(id)
        }
        console.warn('[push] FCM send failed', res.status, errText)
      } catch (err) {
        console.warn('[push] FCM send threw', err)
      }
    })
  )

  if (deadTokenIds.length > 0) {
    await admin.from('device_tokens').delete().in('id', deadTokenIds)
  }
}
