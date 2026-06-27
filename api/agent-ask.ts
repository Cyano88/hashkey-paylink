/**
 * POST /api/agent-ask
 *
 * Payment-gated AI service endpoint — demonstrates the Hash PayLink agentic
 * economy primitive. Any AI service can use this pattern to require verified
 * payment before rendering a response.
 *
 * Body: { eventId?: string, payer: string, question: string, accessMode?: 'helper-free' }
 *
 * Flow:
 *   1. Verify payment on 0G Mainnet via PayLinkArchive contract (trustless)
 *   2. If verified → return AI response + on-chain proof
 *   3. If not verified → 402 Payment Required + payment link
 *
 * Ask Hash gets model intelligence through ZeroScout guidance and only returns
 * after final ZeroScout sponsorship succeeds.
 */

import type { Request, Response } from 'express'
import { ethers }                  from 'ethers'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import {
  getZeroScoutHelperGuidance,
  sponsorZeroScoutAction,
  type ZeroScoutHelperGuidance,
  type ZeroScoutSponsoredAction,
} from './zeroscout-sponsored-action.js'

// ─── 0G Mainnet config ────────────────────────────────────────────────────────
const OG_RPC       = (process.env.OG_RPC_URL ?? process.env.OG_EVM_RPC_URL ?? process.env.ZG_RPC_URL ?? 'https://evmrpc.0g.ai').trim()
const ARCHIVE_ADDR = '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'
const FROM_BLOCK   = parseInt(process.env.OG_FROM_BLOCK ?? '32498000', 10)

const ARCHIVE_ABI = [
  'event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)',
]

const MAX_EVENT_ID_LENGTH = 128
const MAX_PAYER_LENGTH = 128
const MAX_QUESTION_LENGTH = 4_000
const MAX_MEMORY_LENGTH = 1_600
const HELPER_FREE_ACCESS_MODE = 'helper-free'
const HELPER_DAILY_PROMPT_LIMIT = Math.max(1, parseInt(process.env.HELPER_DAILY_PROMPT_LIMIT ?? '20', 10) || 20)
const HELPER_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000
const HELPER_USAGE_STORE = process.env.HELPER_USAGE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/helper-usage.json` : './data/helper-usage.json')
const HELPER_VERIFY_TIMEOUT_MS = Math.max(5_000, parseInt(process.env.HELPER_VERIFY_TIMEOUT_MS ?? '15000', 10) || 15_000)
const UPSTASH_REST_URL = (process.env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '')
const UPSTASH_REST_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim()
const UPSTASH_USAGE_KEY = (process.env.HELPER_USAGE_STORE_KEY ?? 'hashpaylink:helper-usage').trim()
const GENERIC_STRATEGY_PHRASE = 'Build around agentic USDC commerce'
const GENERIC_STRATEGY_PATTERNS = [
  /Hash PayLink Strategy Agent guidance/i,
  /Build around agentic USDC commerce/i,
  /strong MVP should show/i,
  /Frame Arc as/i,
  /Circle as the stablecoin platform layer/i,
  /Polymarket as a high-signal consumer workflow/i,
  /This is product strategy/i,
]

type UsageRecord = {
  count: number
  resetAt: number
}

type UsageStore = {
  usage: Record<string, UsageRecord>
}

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

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), HELPER_VERIFY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
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

async function getHelperPromptUsageStatus(eventId: string, payer: string) {
  const now = Date.now()
  const key = usageKey(eventId, payer)
  const store = await readUsageStore()
  const current = store.usage[key]

  if (!current || current.resetAt <= now) {
    return { allowed: true, remaining: HELPER_DAILY_PROMPT_LIMIT - 1, resetAt: now + HELPER_USAGE_WINDOW_MS }
  }

  if (current.count >= HELPER_DAILY_PROMPT_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt }
  }

  return { allowed: true, remaining: Math.max(0, HELPER_DAILY_PROMPT_LIMIT - current.count - 1), resetAt: current.resetAt }
}

async function verifyPayment(eventId: string, payer: string) {
  const provider = new ethers.JsonRpcProvider(OG_RPC)
  const contract = new ethers.Contract(ARCHIVE_ADDR, ARCHIVE_ABI, provider)
  const latest   = await withTimeout(provider.getBlockNumber(), '0G payment verification')

  const events = await withTimeout(contract.queryFilter(
    contract.filters.PaymentArchived(eventId),
    FROM_BLOCK,
    latest,
  ), '0G payment proof lookup')

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

function isNameQuestion(question: string) {
  return /\b(what'?s|what is|who am i|do you know)\b/i.test(question)
    && /\b(my name|me as|call me|who i am)\b/i.test(question)
}

function isLikelyIdentifier(value: string) {
  return !value
    || value.includes('@')
    || /^0x[a-fA-F0-9]{40}$/.test(value)
    || /^helper-free-/i.test(value)
}

function titleName(value: string) {
  return value
    .trim()
    .replace(/^@+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function nameFromMemory(memorySummary: string, payerName: string) {
  const candidates = [
    /\b(?:user is known as|known as|called|call(?:ed)?|prefers to be called)\s+([A-Za-z][A-Za-z0-9_.-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9_.-]{1,40}){0,2})/i.exec(memorySummary)?.[1],
    /\bHi\s+([A-Za-z][A-Za-z0-9_.-]{1,40})\b/i.exec(memorySummary)?.[1],
    !isLikelyIdentifier(payerName) ? payerName : '',
  ]
  const picked = candidates.map(item => String(item ?? '').trim()).find(Boolean)
  return picked ? titleName(picked) : ''
}

function cleanZeroScoutGuidanceText(value: string) {
  return value
    .split('\n')
    .map(line => line.replace(/^(Signal|Use|Boundary|Missing):\s*/i, '').trim())
    .filter(line => line && !/ZeroScout sponsorship is required/i.test(line))
    .filter(line => !line.includes(GENERIC_STRATEGY_PHRASE))
    .filter(line => !GENERIC_STRATEGY_PATTERNS.some(pattern => pattern.test(line)))
    .slice(0, 5)
    .join('\n')
    .trim()
}

function fallbackHelperAnswer(question: string) {
  if (/\b(receipt|proof|0g archive|share receipt)\b/i.test(question)) {
    return 'After a PayLink is paid, the payer success screen shows the transaction, then the 0G archive and receipt actions appear once the proof is ready.'
  }
  if (/\b(x402|activate x402|service balance|wallet balance|circle balance)\b/i.test(question)) {
    return 'Circle wallet balance is the USDC in your wallet. x402 service balance is the amount activated for paid services. Fund the wallet first, then activate x402 before using paid services.'
  }
  if (/\b(paylink|payment link|request|invoice|collect|charge)\b/i.test(question)) {
    return 'Tell me the payer, amount, network, purpose, and receive wallet. I can then prepare a clean PayLink for sharing.'
  }
  if (/\b(what can you do|help me|how can you help|what do you help with)\b/i.test(question)) {
    return 'I can help with PayLinks, payment receipts, wallet funding, x402 activation, PolyDesk, StreamPay, setup questions, and everyday planning.'
  }
  return ''
}

function answerFromZeroScoutGuidance(question: string, zeroScoutGuidance?: ZeroScoutHelperGuidance) {
  const guidance = cleanZeroScoutGuidanceText(zeroScoutGuidance?.guidance ?? '')
  if (!guidance) return ''
  const limit = /\b(payment|paylink|request|invoice|usdc|wallet|base|arc|arbitrum|solana)\b/i.test(question) ? 900 : 700
  return guidance.length <= limit ? guidance : `${guidance.slice(0, limit - 20).trim()}...`
}

function getHelperResponse(question: string, payerName: string, chain: string, amount: string, memorySummary = '', zeroScoutGuidance?: ZeroScoutHelperGuidance, accessMode = 'paid'): string {
  if (isNameQuestion(question)) {
    const knownName = nameFromMemory(memorySummary, payerName)
    return knownName
      ? `You are ${knownName}.`
      : "I do not know your preferred name yet. Tell me what to call you and I will remember it for future chats."
  }

  const zeroScoutAnswer = answerFromZeroScoutGuidance(question, zeroScoutGuidance)
  if (zeroScoutAnswer) return zeroScoutAnswer

  const fallbackAnswer = fallbackHelperAnswer(question)
  if (fallbackAnswer) return fallbackAnswer

  if (accessMode !== HELPER_FREE_ACCESS_MODE) {
    return `Your paid helper access is verified: ${amount} on ${chain}. What would you like to do next?`
  }

  return 'I can help with payments, PayLinks, StreamPay, PolyDesk, wallets, and setup. Ask me what you want to create or check next.'
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const { eventId: rawEventId, payer: rawPayer, question: rawQuestion, memorySummary: rawMemorySummary, accessMode: rawAccessMode } = (req.body ?? {}) as Record<string, unknown>
  let eventId: string
  let payer: string
  let question: string
  let memorySummary = ''
  const accessMode = rawAccessMode === HELPER_FREE_ACCESS_MODE ? HELPER_FREE_ACCESS_MODE : 'paid'

  try {
    payer = normalizeBoundedString(rawPayer, 'payer', MAX_PAYER_LENGTH)
    question = normalizeBoundedString(rawQuestion, 'question', MAX_QUESTION_LENGTH)
    eventId = accessMode === HELPER_FREE_ACCESS_MODE
      ? String(rawEventId || `helper-free-${crypto.createHash('sha256').update(payer.toLowerCase()).digest('hex').slice(0, 18)}`).slice(0, MAX_EVENT_ID_LENGTH)
      : normalizeBoundedString(rawEventId, 'eventId', MAX_EVENT_ID_LENGTH)
    if (typeof rawMemorySummary === 'string') memorySummary = rawMemorySummary.trim().slice(0, MAX_MEMORY_LENGTH)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
  }

  try {
    // 1. Verify payment on 0G Mainnet unless this is the free Ask Hash helper.
    const result = accessMode === HELPER_FREE_ACCESS_MODE ? null : await verifyPayment(eventId, payer)
    const access = result ?? {
      payment: {
        eventId,
        payer,
        chain: 'Ask Hash',
        amount: '0',
        ts: Math.floor(Date.now() / 1000),
      },
      proof: {
        contract: '',
        network: 'Ask Hash helper',
        rootHash: '',
        ogTxHash: '',
      },
    }

    if (!result && accessMode !== HELPER_FREE_ACCESS_MODE) {
      return res.status(402).json({
        error:           'Payment required',
        paymentRequired: true,
        message:         `No verified payment found for "${payer}" on event ${eventId}.`,
        hint:            'Payment may still be archiving to 0G (~30–60s after confirmation)',
        paymentLink:     `https://hashpaylink.com/pay?v=1&id=${encodeURIComponent(eventId)}`,
      })
    }

    // 2. Payment verified — get AI response
    const usagePreview = await getHelperPromptUsageStatus(eventId, access.payment.payer)
    if (!usagePreview.allowed) {
      res.setHeader('Retry-After', Math.ceil((usagePreview.resetAt - Date.now()) / 1000).toString())
      return res.status(429).json({
        error: 'Daily helper prompt limit reached. Try again after the cooldown.',
        cooldown: true,
        limit: HELPER_DAILY_PROMPT_LIMIT,
        resetAt: usagePreview.resetAt,
      })
    }

    const memorySummaryHash = memorySummary
      ? crypto.createHash('sha256').update(memorySummary).digest('hex')
      : undefined
    const zeroScoutGuidance = await getZeroScoutHelperGuidance({
      service: 'Hash PayLink Helper',
      action: 'helper-chat-preflight',
      user: {
        payer: access.payment.payer,
        email: access.payment.payer,
        wallet: access.payment.payer,
      },
      request: {
        eventId,
        question,
        accessMode,
        memorySummary,
        memorySummaryHash,
      },
      sourceProof: {
        type: accessMode === HELPER_FREE_ACCESS_MODE ? 'helper-free-access' : 'helper_access_receipt',
        contract: access.proof.contract,
        network: access.proof.network,
        rootHash: access.proof.rootHash,
        ogTxHash: access.proof.ogTxHash,
      },
    })

    const answer = getHelperResponse(
      question,
      access.payment.payer,
      access.payment.chain,
      access.payment.amount,
      memorySummary,
      zeroScoutGuidance,
      accessMode,
    )

    const zeroscoutSponsorship: ZeroScoutSponsoredAction | undefined = await sponsorZeroScoutAction({
      service: 'Hash PayLink Helper',
      action: 'helper-chat-response',
      user: {
        payer: access.payment.payer,
        email: access.payment.payer,
        wallet: access.payment.payer,
      },
      request: {
        eventId,
        question,
        accessMode,
        memorySummaryHash,
        guidanceRequestHash: zeroScoutGuidance?.requestHash,
      },
      sourceProof: {
        type: accessMode === HELPER_FREE_ACCESS_MODE ? 'helper-free-access' : 'helper_access_receipt',
        ...access.proof,
      },
      result: {
        answerHash: crypto.createHash('sha256').update(answer).digest('hex'),
        guidanceHash: zeroScoutGuidance?.guidanceHash,
        usageRemaining: usagePreview.remaining,
      },
    })
    if (!zeroscoutSponsorship) {
      return res.status(503).json({
        error: 'ZeroScout sponsorship is required before helper responses are returned. Try again shortly.',
        zeroscoutRequired: true,
      })
    }

    const usage = await consumeHelperPrompt(eventId, access.payment.payer)
    if (!usage.allowed) {
      res.setHeader('Retry-After', Math.ceil((usage.resetAt - Date.now()) / 1000).toString())
      return res.status(429).json({
        error: 'Daily helper prompt limit reached. Try again after the cooldown.',
        cooldown: true,
        limit: HELPER_DAILY_PROMPT_LIMIT,
        resetAt: usage.resetAt,
      })
    }

    return res.json({
      answer,
      accessMode,
      paymentVerified: accessMode !== HELPER_FREE_ACCESS_MODE,
      usage: {
        remaining: usage.remaining,
        limit: HELPER_DAILY_PROMPT_LIMIT,
        resetAt: usage.resetAt,
      },
      payment:         access.payment,
      proof:           accessMode === HELPER_FREE_ACCESS_MODE ? undefined : result?.proof,
      zeroscoutSponsorship,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-ask]', msg)
    const timedOut = /timed out/i.test(msg)
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'Payment verification is still syncing. Try again shortly.' : 'Service temporarily unavailable',
    })
  }
}
