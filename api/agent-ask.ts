/**
 * POST /api/agent-ask
 *
 * Payment-gated AI service endpoint — demonstrates the Hash PayLink agentic
 * economy primitive. Any AI service can use this pattern to require verified
 * payment before rendering a response.
 *
 * Body: { eventId: string, payer: string, question: string }
 *
 * Flow:
 *   1. Verify payment on 0G Mainnet via PayLinkArchive contract (trustless)
 *   2. If verified → return AI response + on-chain proof
 *   3. If not verified → 402 Payment Required + payment link
 *
 * The AI response uses ANTHROPIC_API_KEY if configured, otherwise returns a
 * structured demo response that still fully demonstrates the verification flow.
 */

import type { Request, Response } from 'express'
import { ethers }                  from 'ethers'
import Anthropic                   from '@anthropic-ai/sdk'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'

// ─── 0G Mainnet config ────────────────────────────────────────────────────────
const OG_RPC       = 'https://evmrpc.0g.ai'
const ARCHIVE_ADDR = '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'
const FROM_BLOCK   = parseInt(process.env.OG_FROM_BLOCK ?? '32498000', 10)

const ARCHIVE_ABI = [
  'event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)',
]

const MAX_EVENT_ID_LENGTH = 128
const MAX_PAYER_LENGTH = 128
const MAX_QUESTION_LENGTH = 4_000
const MAX_MEMORY_LENGTH = 1_600
const HELPER_DAILY_PROMPT_LIMIT = Math.max(1, parseInt(process.env.HELPER_DAILY_PROMPT_LIMIT ?? '20', 10) || 20)
const HELPER_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000
const HELPER_USAGE_STORE = process.env.HELPER_USAGE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/helper-usage.json` : './data/helper-usage.json')
const UPSTASH_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '')
const UPSTASH_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
const UPSTASH_USAGE_KEY = (process.env.HELPER_USAGE_STORE_KEY ?? 'hashpaylink:helper-usage').trim()

type UsageRecord = {
  count: number
  resetAt: number
}

type UsageStore = {
  usage: Record<string, UsageRecord>
}

const HASH_PAYLINK_SYSTEM_PROMPT = [
  'You are the Hash PayLink Strategy Agent for Circle, Arc, 0G, Polymarket, and agentic USDC commerce.',
  'Access is only granted after a verified Hash PayLink payment archived on 0G.',
  '',
  'Your specialty:',
  '- Circle Developer Platform and USDC-native product strategy',
  '- Arc ecosystem product ideas and migration planning',
  '- Polymarket funding workflows, LP reward-market interpretation, maker spread planning, and portfolio explanation',
  '- agentic economic activity with stablecoin payments',
  '- Hash PayLink instant payments, StreamPay, paid AI access, and 0G verification',
  '- practical MVPs, grant positioning, technical architecture, and milestone design',
  '',
  'Response standards:',
  '- Give specific, high-signal recommendations, not generic startup advice.',
  '- Prefer concrete build plans, integration steps, and grant-ready positioning.',
  '- For Polymarket questions, explain the data needed, reward constraints, spread logic, risks, and next operational step.',
  '- Do not invent live Polymarket prices, rewards, odds, balances, or positions. If no structured data is supplied, say what to check live.',
  '- Treat LP spread suggestions as educational market-structure analysis, not financial advice.',
  '- Distinguish clearly between what is already built, what is testnet, and what is a future milestone.',
  '- Be honest that Arc is testnet when relevant.',
  '- Do not claim official Circle, Arc, 0G, or Polymarket partnership, endorsement, badges, grant approval, or guaranteed acceptance.',
  '- Do not provide financial, legal, tax, or compliance advice. For regulated questions, give product/technical framing and advise professional review.',
  '- Keep answers concise but valuable.',
].join('\n')

function normalizeBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized
}

async function upstashCommand<T>(command: unknown[]): Promise<T | undefined> {
  if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) return undefined
  const response = await fetch(UPSTASH_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) throw new Error(`Upstash request failed: ${response.status}`)
  const data = await response.json() as { result?: T }
  return data.result
}

async function readUsageStore(): Promise<UsageStore> {
  try {
    const remote = await upstashCommand<string>(['GET', UPSTASH_USAGE_KEY])
    if (remote) return JSON.parse(remote) as UsageStore
  } catch (err) {
    console.warn('[agent-ask] Upstash usage load failed; using file fallback.', err instanceof Error ? err.message : String(err))
  }

  try {
    return JSON.parse(await readFile(HELPER_USAGE_STORE, 'utf8')) as UsageStore
  } catch {
    return { usage: {} }
  }
}

async function writeUsageStore(store: UsageStore) {
  await mkdir(dirname(HELPER_USAGE_STORE), { recursive: true })
  await writeFile(HELPER_USAGE_STORE, JSON.stringify(store, null, 2), 'utf8')
  try {
    await upstashCommand(['SET', UPSTASH_USAGE_KEY, JSON.stringify(store)])
  } catch (err) {
    console.warn('[agent-ask] Upstash usage save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
  }
}

function usageKey(eventId: string, payer: string) {
  return crypto.createHash('sha256').update(`${eventId.toLowerCase()}:${payer.toLowerCase()}`).digest('hex')
}

async function consumeHelperPrompt(eventId: string, payer: string) {
  const now = Date.now()
  const key = usageKey(eventId, payer)
  const store = await readUsageStore()
  const current = store.usage[key]

  if (!current || current.resetAt <= now) {
    store.usage[key] = { count: 1, resetAt: now + HELPER_USAGE_WINDOW_MS }
    await writeUsageStore(store)
    return { allowed: true, remaining: HELPER_DAILY_PROMPT_LIMIT - 1, resetAt: store.usage[key].resetAt }
  }

  if (current.count >= HELPER_DAILY_PROMPT_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt }
  }

  current.count += 1
  store.usage[key] = current
  await writeUsageStore(store)
  return { allowed: true, remaining: Math.max(0, HELPER_DAILY_PROMPT_LIMIT - current.count), resetAt: current.resetAt }
}

// ─── Payment verification (same logic as agent-verify, kept local) ────────────

async function verifyPayment(eventId: string, payer: string) {
  const provider = new ethers.JsonRpcProvider(OG_RPC)
  const contract = new ethers.Contract(ARCHIVE_ADDR, ARCHIVE_ABI, provider)
  const latest   = await provider.getBlockNumber()

  const events = await contract.queryFilter(
    contract.filters.PaymentArchived(eventId),
    FROM_BLOCK,
    latest,
  )

  const match = events.find(
    e => 'args' in e && (e.args[3] as string).toLowerCase() === payer.toLowerCase(),
  )

  if (!match || !('args' in match)) return null

  return {
    payment: {
      eventId,
      payer:  match.args[3] as string,
      chain:  match.args[2] as string,
      amount: match.args[4] as string,
      ts:     Number(match.args[5]),
    },
    proof: {
      ogTxHash:   match.transactionHash,
      ogExplorer: `https://chainscan.0g.ai/tx/${match.transactionHash}`,
      rootHash:   match.args[1] as string,
      contract:   ARCHIVE_ADDR,
      network:    '0G Mainnet (Chain ID 16661)',
    },
  }
}

// ─── AI response ──────────────────────────────────────────────────────────────

async function getAiResponse(question: string, payerName: string, chain: string, amount: string, memorySummary = ''): Promise<string> {
  const memoryContext = memorySummary
    ? `\n\nUser memory summary approved by the payer:\n${memorySummary}\nUse this only to personalize helpful context. Do not expose it unless the user asks.`
    : ''
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system:     `${HASH_PAYLINK_SYSTEM_PROMPT}\n\nVerified access context: ${payerName} paid ${amount} on ${chain}, confirmed on 0G decentralized storage.${memoryContext}`,
        messages:   [{ role: 'user', content: question }],
      })
      const block = message.content[0]
      if (block.type === 'text') {
        console.log('[agent-ask] Claude responded successfully')
        return block.text
      }
    } catch (err) {
      console.error('[agent-ask] Claude error:', err instanceof Error ? err.message : String(err))
    }
  } else {
    console.warn('[agent-ask] ANTHROPIC_API_KEY not set')
  }

  const fallbackLines = [
    `Access granted. Your payment of ${amount} on ${chain} has been verified on 0G decentralized storage.`,
    '',
    `You asked: "${question}"`,
    '',
    'Hash PayLink Strategy Agent guidance:',
    '',
    'Build around agentic USDC commerce: instant PayLinks for one-time settlement, StreamPay on Arc for time-based budgets and retainers, Polymarket funding/LP intelligence for prediction-market users, and 0G proofs for verifiable AI access. A strong MVP should show a paid request, a verified 0G archive proof, and either an AI answer unlock, an Arc USDC stream, or a Polymarket funding/LP workflow. Frame Arc as the programmable USDC settlement environment, Circle as the stablecoin platform layer, and Polymarket as a high-signal consumer workflow. This is product strategy, not financial advice.',
  ]
  return fallbackLines.join('\n')
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const { eventId: rawEventId, payer: rawPayer, question: rawQuestion, memorySummary: rawMemorySummary } = (req.body ?? {}) as Record<string, unknown>
  let eventId: string
  let payer: string
  let question: string
  let memorySummary = ''

  try {
    eventId = normalizeBoundedString(rawEventId, 'eventId', MAX_EVENT_ID_LENGTH)
    payer = normalizeBoundedString(rawPayer, 'payer', MAX_PAYER_LENGTH)
    question = normalizeBoundedString(rawQuestion, 'question', MAX_QUESTION_LENGTH)
    if (typeof rawMemorySummary === 'string') memorySummary = rawMemorySummary.trim().slice(0, MAX_MEMORY_LENGTH)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
  }

  try {
    // 1. Verify payment on 0G Mainnet
    const result = await verifyPayment(eventId, payer)

    if (!result) {
      return res.status(402).json({
        error:           'Payment required',
        paymentRequired: true,
        message:         `No verified payment found for "${payer}" on event ${eventId}.`,
        hint:            'Payment may still be archiving to 0G (~30–60s after confirmation)',
        paymentLink:     `https://hashpaylink.com/pay?v=1&id=${encodeURIComponent(eventId)}`,
      })
    }

    // 2. Payment verified — get AI response
    const usage = await consumeHelperPrompt(eventId, result.payment.payer)
    if (!usage.allowed) {
      res.setHeader('Retry-After', Math.ceil((usage.resetAt - Date.now()) / 1000).toString())
      return res.status(429).json({
        error: 'Daily helper prompt limit reached. Try again after the cooldown.',
        cooldown: true,
        limit: HELPER_DAILY_PROMPT_LIMIT,
        resetAt: usage.resetAt,
      })
    }

    const answer = await getAiResponse(
      question,
      result.payment.payer,
      result.payment.chain,
      result.payment.amount,
      memorySummary,
    )

    return res.json({
      answer,
      paymentVerified: true,
      usage: {
        remaining: usage.remaining,
        limit: HELPER_DAILY_PROMPT_LIMIT,
        resetAt: usage.resetAt,
      },
      payment:         result.payment,
      proof:           result.proof,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-ask]', msg)
    return res.status(500).json({ error: 'Service temporarily unavailable' })
  }
}
