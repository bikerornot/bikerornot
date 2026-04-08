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
              <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;"><span style="color:#ffffff;">Biker</span><span style="color:#f97316;">Or</span><span style="color:#ffffff;">Not</span></span>
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

export async function sendWallPostEmail({
  toEmail,
  toName,
  fromUsername,
  postSnippet,
  profileUrl,
}: {
  toEmail: string
  toName: string
  fromUsername: string
  postSnippet: string
  profileUrl: string
}) {
  const snippet = postSnippet.length > 200 ? postSnippet.slice(0, 200) + '...' : postSnippet

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${fromUsername} posted on your wall on BikerOrNot`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
        New post on your wall
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${toName}, <strong style="color:#ffffff;">@${fromUsername}</strong> posted on your wall.
      </p>
      ${snippet ? `
      <div style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#d4d4d8;line-height:1.5;">
          "${snippet}"
        </p>
      </div>
      ` : ''}
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <a href="${profileUrl}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              View Your Wall
            </a>
          </td>
        </tr>
      </table>
    `),
  })
}

export async function sendCommentEmail({
  toEmail,
  toName,
  fromUsername,
  commentSnippet,
  postUrl,
  isReply,
}: {
  toEmail: string
  toName: string
  fromUsername: string
  commentSnippet: string
  postUrl: string
  isReply: boolean
}) {
  const snippet = commentSnippet.length > 200 ? commentSnippet.slice(0, 200) + '...' : commentSnippet
  const subject = isReply
    ? `${fromUsername} replied to your comment on BikerOrNot`
    : `${fromUsername} commented on your post on BikerOrNot`
  const heading = isReply ? 'New reply to your comment' : 'New comment on your post'

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
        ${heading}
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${toName}, <strong style="color:#ffffff;">@${fromUsername}</strong> ${isReply ? 'replied to your comment' : 'commented on your post'}.
      </p>
      <div style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:#d4d4d8;line-height:1.5;">
          "${snippet}"
        </p>
      </div>
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <a href="${postUrl}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              View Comment
            </a>
          </td>
        </tr>
      </table>
    `),
  })
}

export async function sendMentionEmail({
  toEmail,
  toName,
  toAvatarUrl,
  fromUsername,
  fromAvatarUrl,
  postSnippet,
  postUrl,
  postImageUrl,
}: {
  toEmail: string
  toName: string
  toAvatarUrl: string | null
  fromUsername: string
  fromAvatarUrl: string | null
  postSnippet: string
  postUrl: string
  postImageUrl: string | null
}) {
  const fromAvatarHtml = fromAvatarUrl
    ? `<img src="${fromAvatarUrl}" alt="@${fromUsername}" width="40" height="40" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:40px;height:40px;border-radius:50%;background:#3f3f46;color:#a1a1aa;font-size:16px;font-weight:700;line-height:40px;text-align:center;">${(fromUsername[0] ?? '?').toUpperCase()}</div>`

  const toAvatarHtml = toAvatarUrl
    ? `<img src="${toAvatarUrl}" alt="${toName}" width="32" height="32" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />`
    : ''

  const imageHtml = postImageUrl
    ? `<img src="${postImageUrl}" alt="" width="440" style="width:100%;max-width:440px;border-radius:8px;margin-top:16px;display:block;" />`
    : ''

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `@${fromUsername} mentioned you in a post`,
    html: layout(`
      <!-- Recipient greeting with their avatar -->
      <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td style="vertical-align:middle;padding-right:10px;">
            ${toAvatarHtml}
          </td>
          <td style="vertical-align:middle;">
            <p style="margin:0;font-size:15px;color:#a1a1aa;">Hey ${toName},</p>
          </td>
        </tr>
      </table>

      <h1 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#ffffff;">
        You were mentioned in a post
      </h1>

      <!-- Tagger info + post snippet -->
      <table cellpadding="0" cellspacing="0" style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:16px;width:100%;">
        <tr>
          <td style="vertical-align:top;padding-right:12px;width:40px;">
            ${fromAvatarHtml}
          </td>
          <td style="vertical-align:top;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#ffffff;">
              @${fromUsername}
            </p>
            <p style="margin:0;font-size:14px;color:#d4d4d8;line-height:1.5;">
              ${postSnippet}
            </p>
            ${imageHtml}
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr>
          <td>
            <a href="${postUrl}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              See what they said
            </a>
          </td>
        </tr>
      </table>
    `),
  })
}

// ─── Weekly Digest ──────────────────────────────────────────

interface NearbyRiderDigest {
  username: string
  firstName: string
  city: string | null
  state: string | null
  bike: string | null
  profilePhotoUrl: string | null
}

export async function sendWeeklyDigestEmail({
  toEmail,
  toName,
  nearbyRiders,
  totalNearby,
  pendingRequests = 0,
}: {
  toEmail: string
  toName: string
  nearbyRiders: NearbyRiderDigest[]
  totalNearby: number
  pendingRequests?: number
}) {
  const ridersHtml = nearbyRiders.map((r) => {
    const location = [r.city, r.state].filter(Boolean).join(', ')
    const photoUrl = r.profilePhotoUrl
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${r.profilePhotoUrl}`
      : null
    const avatar = photoUrl
      ? `<img src="${photoUrl}" width="44" height="44" style="width:44px;height:44px;border-radius:50%;object-fit:cover;" alt="" />`
      : `<div style="width:44px;height:44px;border-radius:50%;background:#3f3f46;line-height:44px;text-align:center;color:#a1a1aa;font-weight:700;font-size:16px;">${(r.firstName?.[0] ?? '?').toUpperCase()}</div>`

    return `
      <tr>
        <td style="padding:8px 0;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="52" valign="top">${avatar}</td>
              <td style="padding-left:12px;" valign="middle">
                <a href="${BASE_URL}/profile/${r.username}" style="color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">@${r.username}</a>
                ${location ? `<br/><span style="color:#a1a1aa;font-size:13px;">${location}</span>` : ''}
                ${r.bike ? `<br/><span style="color:#f97316;font-size:13px;">${r.bike}</span>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  }).join('')

  const moreText = totalNearby > nearbyRiders.length
    ? `<p style="margin:16px 0 0;font-size:14px;color:#71717a;">+ ${totalNearby - nearbyRiders.length} more new riders near you</p>`
    : ''

  const pendingHtml = pendingRequests > 0 ? `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr>
          <td style="background:#f97316;border-radius:12px;padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#ffffff;">
              You have ${pendingRequests} pending friend request${pendingRequests !== 1 ? 's' : ''}
            </p>
            <a href="${BASE_URL}/friends" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:underline;">
              See Requests →
            </a>
          </td>
        </tr>
      </table>` : ''

  const subject = pendingRequests > 0 && totalNearby === 0
    ? `You have ${pendingRequests} pending friend request${pendingRequests !== 1 ? 's' : ''} on BikerOrNot`
    : `${totalNearby} new rider${totalNearby !== 1 ? 's' : ''} joined near you this week`

  const ridersSection = totalNearby > 0 ? `
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">
        New riders near you
      </h1>
      <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${toName}, ${totalNearby} new rider${totalNearby !== 1 ? 's' : ''} joined BikerOrNot near you this week.
      </p>` : `
      <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.6;">
        Hey ${toName}, here's your weekly update from BikerOrNot.
      </p>`

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject,
    html: layout(`
      ${pendingHtml}
      ${ridersSection}
      <table cellpadding="0" cellspacing="0" width="100%">
        ${ridersHtml}
      </table>
      ${moreText}
      <table cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr>
          <td>
            <a href="${BASE_URL}/people" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px;">
              See Who Joined
            </a>
          </td>
        </tr>
      </table>
    `),
  })
}
