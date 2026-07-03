import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { sendTransactionalEmail } from './email-provider.js'

const FROM_EMAIL = process.env.STREAM_INVITE_FROM_EMAIL ?? process.env.ALERT_FROM_EMAIL
const FROM_NAME = process.env.STREAM_INVITE_FROM_NAME ?? 'HashpayStream'

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function cleanText(value: unknown, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 120)
}

function cleanUrl(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function baseUrl(req: Request) {
  const configured = process.env.STREAMPAY_BASE_URL ?? process.env.HASH_PAYLINK_BASE_URL
  if (configured) return configured.replace(/\/+$/, '')
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0]
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0]
  return `${proto}://${host}`.replace(/\/+$/, '')
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  try {
    const email = normalizeEmail(req.body?.email)
    if (!email) return res.status(400).json({ ok: false, error: 'Invalid recipient email.' })

    const amount = cleanText(req.body?.amount, 'USDC')
    const duration = cleanText(req.body?.duration, 'a HashpayStream retainer')
    const reason = cleanText(req.body?.reason, 'HashpayStream retainer')
    const streamUrl = cleanUrl(req.body?.streamUrl)

    if (streamUrl) {
      const subject = `Your HashpayStream claim link is ready`
      const text = [
        'Your HashpayStream USDC stream is live.',
        '',
        `Amount: ${amount}`,
        `Duration: ${duration}`,
        `Memo: ${reason || 'HashpayStream retainer'}`,
        '',
        'Open this link to view and claim with Circle Smart Wallet on Arc:',
        streamUrl,
      ].join('\n')

      const html = `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
          <h2 style="margin:0 0 12px">Your HashpayStream claim link is ready</h2>
          <p>Your HashpayStream USDC stream is live.</p>
          <p><strong>Amount:</strong> ${amount}<br/><strong>Duration:</strong> ${duration}<br/><strong>Memo:</strong> ${reason || 'HashpayStream retainer'}</p>
          <p><a href="${streamUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:12px;padding:12px 18px;font-weight:700">Open HashpayStream Claim</a></p>
          <p style="font-size:13px;color:#6b7280">Claims stay inside Circle Smart Wallet on Arc.</p>
        </div>
      `

      await sendTransactionalEmail({
        to: email,
        fromEmail: FROM_EMAIL,
        fromName: FROM_NAME,
        subject,
        text,
        html,
        context: 'invite',
      })

      return res.json({ ok: true, email, streamUrl })
    }

    const pendingId = crypto.randomBytes(8).toString('hex')
    const setup = new URL('/recipient', baseUrl(req))
    const dedicatedStreamPay =
      setup.hostname === 'streampay.xyz' ||
      setup.hostname.endsWith('.streampay.xyz') ||
      setup.hostname === 'hashpaystream.app' ||
      setup.hostname === 'www.hashpaystream.app' ||
      setup.hostname.includes('streampay')
    if (!dedicatedStreamPay) setup.searchParams.set('app', 'streampay')
    setup.searchParams.set('email', email)
    setup.searchParams.set('pending', pendingId)
    const setupUrl = setup.toString()

    const subject = `Prepare your HashpayStream wallet`
    const text = [
      'You have been invited to receive a HashpayStream USDC stream.',
      '',
      `Amount: ${amount}`,
      `Duration: ${duration}`,
      `Memo: ${reason || 'HashpayStream retainer'}`,
      '',
      'Open this link to prepare your Circle Smart Wallet on Arc:',
      setupUrl,
      '',
      'You only prepare the receiving wallet. The sender funds and deploys the stream.',
    ].join('\n')

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Prepare your HashpayStream wallet</h2>
        <p>You have been invited to receive a HashpayStream USDC stream.</p>
        <p><strong>Amount:</strong> ${amount}<br/><strong>Duration:</strong> ${duration}<br/><strong>Memo:</strong> ${reason || 'HashpayStream retainer'}</p>
        <p><a href="${setupUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:12px;padding:12px 18px;font-weight:700">Prepare Circle Wallet</a></p>
        <p style="font-size:13px;color:#6b7280">You only prepare the receiving wallet. The sender funds and deploys the stream.</p>
      </div>
    `

    await sendTransactionalEmail({
      to: email,
      fromEmail: FROM_EMAIL,
      fromName: FROM_NAME,
      subject,
      text,
      html,
      context: 'invite',
    })

    return res.json({ ok: true, email, pendingId, setupUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send HashpayStream invite.'
    return res.status(500).json({ ok: false, error: message })
  }
}
