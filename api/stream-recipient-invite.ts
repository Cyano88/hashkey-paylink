import type { Request, Response } from 'express'
import crypto from 'node:crypto'

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL = process.env.STREAM_INVITE_FROM_EMAIL ?? process.env.ALERT_FROM_EMAIL
const FROM_NAME = process.env.STREAM_INVITE_FROM_NAME ?? 'StreamPay'

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 120)
}

function baseUrl(req: Request) {
  const configured = process.env.STREAMPAY_BASE_URL ?? process.env.HASH_PAYLINK_BASE_URL
  if (configured) return configured.replace(/\/+$/, '')
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0]
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0]
  return `${proto}://${host}`.replace(/\/+$/, '')
}

async function sendSendGridMail(payload: Record<string, unknown>) {
  if (!SENDGRID_API_KEY || !FROM_EMAIL) {
    throw new Error('StreamPay invite email is not configured. Set SENDGRID_API_KEY and STREAM_INVITE_FROM_EMAIL or ALERT_FROM_EMAIL.')
  }
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body ? `SendGrid rejected invite: ${body.slice(0, 180)}` : 'SendGrid rejected invite email.')
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const email = normalizeEmail(req.body?.email)
    if (!email) return res.status(400).json({ ok: false, error: 'Invalid recipient email.' })

    const amount = cleanText(req.body?.amount, 'USDC')
    const duration = cleanText(req.body?.duration, 'a StreamPay retainer')
    const reason = cleanText(req.body?.reason, 'StreamPay retainer')
    const pendingId = crypto.randomBytes(8).toString('hex')
    const setup = new URL('/recipient', baseUrl(req))
    const dedicatedStreamPay = setup.hostname === 'streampay.xyz' || setup.hostname.endsWith('.streampay.xyz') || setup.hostname.includes('streampay')
    if (!dedicatedStreamPay) setup.searchParams.set('app', 'streampay')
    setup.searchParams.set('email', email)
    setup.searchParams.set('pending', pendingId)
    const setupUrl = setup.toString()

    const subject = `Prepare your StreamPay wallet`
    const text = [
      'You have been invited to receive a StreamPay USDC stream.',
      '',
      `Amount: ${amount}`,
      `Duration: ${duration}`,
      `Memo: ${reason || 'StreamPay retainer'}`,
      '',
      'Open this link to prepare your Circle Smart Wallet on Arc:',
      setupUrl,
      '',
      'You only prepare the receiving wallet. The sender funds and deploys the stream.',
    ].join('\n')

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Prepare your StreamPay wallet</h2>
        <p>You have been invited to receive a StreamPay USDC stream.</p>
        <p><strong>Amount:</strong> ${amount}<br/><strong>Duration:</strong> ${duration}<br/><strong>Memo:</strong> ${reason || 'StreamPay retainer'}</p>
        <p><a href="${setupUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:12px;padding:12px 18px;font-weight:700">Prepare Circle Wallet</a></p>
        <p style="font-size:13px;color:#6b7280">You only prepare the receiving wallet. The sender funds and deploys the stream.</p>
      </div>
    `

    await sendSendGridMail({
      personalizations: [{ to: [{ email }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    })

    return res.json({ ok: true, email, pendingId, setupUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send StreamPay invite.'
    return res.status(500).json({ ok: false, error: message })
  }
}
