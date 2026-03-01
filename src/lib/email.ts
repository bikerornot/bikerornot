import 'server-only'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'BikerOrNot <noreply@bikerornot.com>'
const BASE_URL = 'https://www.bikerornot.com'

function layout(body: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <span style="font-size:22px;font-weight:700;color:#f97316;letter-spacing:-0.5px;">BikerOrNot</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:#52525b;">
                You're receiving this because you have an account at
                <a href="${BASE_URL}" style="color:#f97316;text-decoration:none;">BikerOrNot</a>.
                &nbsp;·&nbsp;
                <a href="${BASE_URL}/settings" style="color:#52525b;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendFriendRequestEmail({
  toEmail,
  toName,
  fromUsername,
}: {
  toEmail: string
  toName: string
  fromUsername: string
}) {
  const profileUrl = `${BASE_URL}/profile/${fromUsername}`

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${fromUsername} sent you a friend request on BikerOrNot`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
        New friend request
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${toName}, <strong style="color:#ffffff;">@${fromUsername}</strong> wants to connect with you on BikerOrNot.
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <a href="${profileUrl}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              View Profile
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#71717a;">
        Log in to accept or decline the request.
      </p>
    `),
  })
}

export async function sendConfirmEmailReminder({
  toEmail,
  firstName,
}: {
  toEmail: string
  firstName: string
}) {
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Confirm your email to join BikerOrNot',
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
        One step left — confirm your email
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${firstName}, you started signing up for BikerOrNot but haven't confirmed your email yet.
        Check your inbox for the confirmation link we sent, or click below to resend it.
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <a href="${BASE_URL}/auth/resend-confirmation" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              Resend confirmation email
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#71717a;">
        Once confirmed, you'll be able to set up your profile and connect with other riders.
      </p>
    `),
  })
}

export async function sendOnboardingReminder({
  toEmail,
  firstName,
  magicLink,
}: {
  toEmail: string
  firstName: string
  magicLink: string
}) {
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Finish setting up your BikerOrNot profile',
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
        Your profile is almost ready
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${firstName}, you confirmed your email but haven't finished setting up your BikerOrNot profile yet.
        It only takes a minute — pick a username, add a photo, and tell us about your ride.
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <a href="${magicLink}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              Complete your profile
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#71717a;">
        This link is valid for 24 hours. If it expires, just visit
        <a href="${BASE_URL}" style="color:#f97316;text-decoration:none;">bikerornot.com</a>
        and sign in to continue.
      </p>
    `),
  })
}

export async function sendFriendAcceptedEmail({
  toEmail,
  toName,
  fromUsername,
}: {
  toEmail: string
  toName: string
  fromUsername: string
}) {
  const profileUrl = `${BASE_URL}/profile/${fromUsername}`

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${fromUsername} accepted your friend request on BikerOrNot`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
        Friend request accepted!
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${toName}, <strong style="color:#ffffff;">@${fromUsername}</strong> accepted your friend request. You're now connected on BikerOrNot.
      </p>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <a href="${profileUrl}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              View Profile
            </a>
          </td>
        </tr>
      </table>
    `),
  })
}
