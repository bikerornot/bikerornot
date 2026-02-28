import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send({
    from: 'BikerOrNot <noreply@bikerornot.com>',
    to: 'test@bikerornot.com',
    subject: 'Test email',
    html: '<p>Test</p>',
  })

  return NextResponse.json({ data, error, apiKeyPrefix: apiKey.slice(0, 8) })
}
