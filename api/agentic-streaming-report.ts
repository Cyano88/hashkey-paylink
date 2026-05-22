import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import { buildLiveScout } from './x402-polymarket-scout.js'
import {
  appendAgenticStreamingDelivery,
  readAgenticStreamingStore,
  type AgenticStreamingDelivery,
  type AgenticStreamingSubscription,
} from './agentic-streaming-store.js'

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
const FROM_EMAIL = process.env.AGENTIC_STREAMING_FROM_EMAIL ?? process.env.STREAM_INVITE_FROM_EMAIL ?? process.env.ALERT_FROM_EMAIL
const FROM_NAME = process.env.AGENTIC_STREAMING_FROM_NAME ?? 'Hash PayLink Agent'
const REPORT_SECRET = String(process.env.AGENTIC_STREAMING_CRON_SECRET ?? process.env.CRON_SECRET ?? process.env.AGENT_WALLET_SERVICE_SECRET ?? '').trim()
const REPORT_INTERVAL_MS = Number(process.env.AGENTIC_STREAMING_REPORT_INTERVAL_HOURS ?? 23) * 60 * 60 * 1000

type Scout = Awaited<ReturnType<typeof buildLiveScout>>

function authorized(req: Request) {
  const secret = String(req.headers['x-agentic-streaming-secret'] ?? req.query.secret ?? req.body?.secret ?? '').trim()
  return !!REPORT_SECRET
    && secret.length === REPORT_SECRET.length
    && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(REPORT_SECRET))
}

function compactAddress(value?: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : 'n/a'
}

function formatUsdc(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'n/a'
}

function formatCents(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}c` : 'n/a'
}

function topTitles(scout: Scout) {
  return scout.opportunities.map(item => String(item.title ?? 'Untitled market').slice(0, 140))
}

function emailBody(subscription: AgenticStreamingSubscription, scout: Scout) {
  const opportunities = scout.opportunities.slice(0, 3)
  const textLines = [
    'Hash PayLink LP Research',
    '',
    `Service: Polymarket LP Research`,
    `Agent: ${subscription.agentSlug}`,
    `Stream: ${compactAddress(subscription.vault)}`,
    `Rate: ${subscription.amountPerDay} USDC/day`,
    '',
    scout.summary,
    '',
    ...opportunities.flatMap((item, index) => [
      `${index + 1}. ${item.title}`,
      `Reward/day: ${formatUsdc(item.dailyReward)} USDC | Spread: ${formatCents(item.liveSpread)} | Risk: ${item.lpExecutionRisk}`,
      item.marketUrl ? `Market: ${item.marketUrl}` : '',
      '',
    ]),
    'Autopilot preview: monitor only. Execution stays locked until trading credentials and explicit risk limits are configured.',
    '',
    `Stream: ${subscription.streamUrl}`,
    '',
    scout.disclaimer,
  ].filter(Boolean)

  const cards = opportunities.map((item, index) => `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:10px 0">
      <div style="font-weight:700;color:#111827">${index + 1}. ${escapeHtml(String(item.title ?? 'Untitled market'))}</div>
      <div style="font-size:13px;color:#4b5563;margin-top:6px">Reward/day: ${formatUsdc(item.dailyReward)} USDC · Spread: ${formatCents(item.liveSpread)} · Risk: ${escapeHtml(String(item.lpExecutionRisk ?? 'n/a'))}</div>
      ${item.marketUrl ? `<a href="${escapeHtml(item.marketUrl)}" style="font-size:13px;color:#2563eb;text-decoration:none">Open market</a>` : ''}
    </div>
  `).join('')

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;max-width:620px">
      <h2 style="margin:0 0 8px">Hash PayLink LP Research</h2>
      <p style="margin:0 0 14px;color:#4b5563">Agent: ${escapeHtml(subscription.agentSlug)} · Rate: ${subscription.amountPerDay} USDC/day · Stream: ${compactAddress(subscription.vault)}</p>
      <p>${escapeHtml(scout.summary)}</p>
      ${cards || '<p>No live opportunities returned. The agent will retry on the next report.</p>'}
      <p style="font-size:13px;color:#4b5563">Autopilot preview: monitor only. Execution stays locked until trading credentials and explicit risk limits are configured.</p>
      <p><a href="${escapeHtml(subscription.streamUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;border-radius:10px;padding:10px 14px;font-weight:700">View Stream</a></p>
      <p style="font-size:12px;color:#6b7280">${escapeHtml(scout.disclaimer)}</p>
    </div>
  `

  return { text: textLines.join('\n'), html }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function sendReportEmail(subscription: AgenticStreamingSubscription, scout: Scout) {
  if (!SENDGRID_API_KEY || !FROM_EMAIL) throw new Error('Email is not configured. Set SENDGRID_API_KEY and AGENTIC_STREAMING_FROM_EMAIL or ALERT_FROM_EMAIL.')
  const { text, html } = emailBody(subscription, scout)
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: subscription.reportEmail }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: `Hash PayLink LP Research - ${new Date().toISOString().slice(0, 10)}`,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body ? `SendGrid rejected report: ${body.slice(0, 180)}` : 'SendGrid rejected report email.')
  }
}

function isDue(subscription: AgenticStreamingSubscription, now: number, force: boolean) {
  if (force) return true
  if (!subscription.lastReportAt) return true
  return now - subscription.lastReportAt >= REPORT_INTERVAL_MS
}

async function processSubscription(subscription: AgenticStreamingSubscription, scout: Scout, dryRun: boolean): Promise<AgenticStreamingDelivery> {
  const generatedAt = Date.now()
  const base = {
    id: crypto.randomUUID(),
    subscriptionId: subscription.id,
    email: subscription.reportEmail,
    generatedAt,
    dryRun: dryRun || undefined,
    scoutSummary: scout.summary,
    topTitles: topTitles(scout),
  }
  try {
    if (!dryRun) await sendReportEmail(subscription, scout)
    return appendAgenticStreamingDelivery({ ...base, status: dryRun ? 'skipped' : 'sent' })
  } catch (error) {
    return appendAgenticStreamingDelivery({
      ...base,
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 240) : 'Report failed.',
    })
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' })

  const dryRun = req.query.dryRun === '1' || req.body?.dryRun === true
  const force = req.query.force === '1' || req.body?.force === true
  const now = Date.now()
  const store = await readAgenticStreamingStore()
  const due = Object.values(store.subscriptions ?? {})
    .filter(item => item.status === 'active' && item.service === 'polymarket-lp' && isDue(item, now, force))
    .slice(0, 5)

  if (!due.length) return res.json({ ok: true, processed: 0, deliveries: [] })

  const scout = await buildLiveScout()
  const deliveries = []
  for (const subscription of due) {
    deliveries.push(await processSubscription(subscription, scout, dryRun))
  }
  return res.json({ ok: true, processed: deliveries.length, dryRun, deliveries })
}
