/**
 * POST /api/agent-ask
 *
 * Existing helper-session compatibility endpoint. Legacy paid requests based
 * on public archive labels are retired; archive evidence is not authorization.
 * Pocket uses this compatibility route alongside its dedicated assistant API.
 */


import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import {
  getZeroScoutHelperGuidance,
  sponsorZeroScoutAction,
  type ZeroScoutHelperGuidance,
  type ZeroScoutSponsoredAction,
} from './zeroscout-sponsored-action.js'
import { readDurableJson, writeDurableJson } from './render-durable-store.js'
import {
  circlePocketIdentityErrorStatus,
  resolveCirclePocketIdentity,
} from './circle-pocket-identity.js'
import { routeCirclePocketQuestion, type CirclePocketRoute } from './pocket/agent-router.js'
import { readHelperProfileMemory } from './helper-profile.js'
const MAX_QUESTION_LENGTH = 4_000
const HELPER_FREE_ACCESS_MODE = 'helper-free'
const HELPER_MODES = new Set(['circle-pocket'])
const HELPER_SIMPLE_DAILY_PROMPT_LIMIT = Math.max(1, parseInt(process.env.HELPER_SIMPLE_DAILY_PROMPT_LIMIT ?? process.env.HELPER_DAILY_PROMPT_LIMIT ?? '100', 10) || 100)
const HELPER_USAGE_WINDOW_MS = 24 * 60 * 60 * 1000
const HELPER_USAGE_STORE = process.env.HELPER_USAGE_STORE
  ?? (process.env.DATA_PATH ? `${process.env.DATA_PATH}/helper-usage.json` : './data/helper-usage.json')
const HELPER_USAGE_STORE_KEY = (process.env.HELPER_USAGE_STORE_KEY ?? 'hashpaylink:helper-usage').trim()
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

async function readUsageStore(): Promise<UsageStore> {
  try {
    const remote = await readDurableJson<Partial<UsageStore>>(HELPER_USAGE_STORE_KEY)
    if (remote) return { usage: remote.usage ?? {} }
  } catch (err) {
    console.warn('[agent-ask] durable usage load failed; using file fallback.', err instanceof Error ? err.message : String(err))
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
    await writeDurableJson(HELPER_USAGE_STORE_KEY, store)
  } catch (err) {
    console.warn('[agent-ask] durable usage save failed; file fallback saved.', err instanceof Error ? err.message : String(err))
  }
}

type HelperUsageTier = 'simple'

function helperLimitForTier(_tier: HelperUsageTier) {
  return HELPER_SIMPLE_DAILY_PROMPT_LIMIT
}

function usageKey(eventId: string, payer: string, tier: HelperUsageTier) {
  return crypto.createHash('sha256').update(`${tier}:${eventId.toLowerCase()}:${payer.toLowerCase()}`).digest('hex')
}

async function consumeHelperPrompt(eventId: string, payer: string, tier: HelperUsageTier) {
  const now = Date.now()
  const limit = helperLimitForTier(tier)
  const key = usageKey(eventId, payer, tier)
  const store = await readUsageStore()
  const current = store.usage[key]

  if (!current || current.resetAt <= now) {
    store.usage[key] = { count: 1, resetAt: now + HELPER_USAGE_WINDOW_MS }
    await writeUsageStore(store)
    return { allowed: true, remaining: limit - 1, resetAt: store.usage[key].resetAt, limit, tier }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt, limit, tier }
  }

  current.count += 1
  store.usage[key] = current
  await writeUsageStore(store)
  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt, limit, tier }
}

// ─── Payment verification (same logic as agent-verify, kept local) ────────────

async function getHelperPromptUsageStatus(eventId: string, payer: string, tier: HelperUsageTier) {
  const now = Date.now()
  const limit = helperLimitForTier(tier)
  const key = usageKey(eventId, payer, tier)
  const store = await readUsageStore()
  const current = store.usage[key]

  if (!current || current.resetAt <= now) {
    return { allowed: true, remaining: limit - 1, resetAt: now + HELPER_USAGE_WINDOW_MS, limit, tier }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt, limit, tier }
  }

  return { allowed: true, remaining: Math.max(0, limit - current.count - 1), resetAt: current.resetAt, limit, tier }
}


// ─── AI response ──────────────────────────────────────────────────────────────

function isNameQuestion(question: string) {
  return /\b(what'?s|what is|who am i|do you know|do you (?:still )?remember|can you remember)\b/i.test(question)
    && /\b(my name|me as|call me|who i am)\b/i.test(question)
}

function isLikelyIdentifier(value: string) {
  return !value
    || value.includes('@')
    || /^0x[a-fA-F0-9]{40}$/.test(value)
    || /^helper-free-/i.test(value)
    || /^circle-pocket-/i.test(value)
    || /^anonymous-helper$/i.test(value)
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
    /\b(?:user is known as|known as|called|call(?:ed)?|prefers to be called)\s+([A-Za-z][A-Za-z0-9_-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9_-]{1,40}){0,2})(?=[\s.!,;:]|$)/i.exec(memorySummary)?.[1],
    /\bHi\s+([A-Za-z][A-Za-z0-9_.-]{1,40})\b/i.exec(memorySummary)?.[1],
    !isLikelyIdentifier(payerName) ? payerName : '',
  ]
  const picked = candidates
    .map(item => String(item ?? '').trim().replace(/\b(?:not|is not|isn't)\s+@?[a-zA-Z0-9_.-]+.*$/i, '').replace(/\banymore\b.*$/i, '').trim())
    .find(Boolean)
  return picked ? titleName(picked) : ''
}

function introducedName(question: string) {
  const match = /\b(?:my name is|i am|i'm|call me)\s+([A-Za-z][A-Za-z0-9_-]{1,40}(?:\s+[A-Za-z][A-Za-z0-9_-]{1,40}){0,2})\b/i.exec(question)
  const name = match?.[1]?.trim() ?? ''
  if (!name || /\b(agent|hash|trying|asking|looking|tired|ready|done|here)\b/i.test(name)) return ''
  return titleName(name)
}

function cleanZeroScoutGuidanceText(value: string) {
  return value
    .split('\n')
    .map(line => line.replace(/^(Signal|Use|Boundary|Missing):\s*/i, '').trim())
    .filter(line => line && !/ZeroScout sponsorship is required/i.test(line))
    .filter(line => !line.includes(GENERIC_STRATEGY_PHRASE))
    .filter(line => !GENERIC_STRATEGY_PATTERNS.some(pattern => pattern.test(line)))
    .filter(line => !/^I can help with payments,\s*PayLinks,\s*HashpayStream,\s*PolyDesk,\s*wallets,\s*and setup/i.test(line))
    .slice(0, 5)
    .join('\n')
    .trim()
}

function fallbackHelperAnswer(question: string) {
  if (/\blocal_action=remember_name\b/i.test(question)) {
    const name = /preferred_name=([^\n]+)/i.exec(question)?.[1]?.trim()
    return name ? `Got it. I will call you ${name}.` : 'Got it. I will remember that.'
  }
  if (/\blocal_action=remember_relationship\b/i.test(question)) {
    const relationship = /relationship=([^\n]+)/i.exec(question)?.[1]?.trim() || 'friend'
    const name = /name=([^\n]+)/i.exec(question)?.[1]?.trim()
    return name ? `Got it. I will remember that your ${relationship} is ${name}.` : 'Got it. I will remember that.'
  }
  if (/\blocal_action=personal_memory_answer\b/i.test(question)) {
    const name = /known_name=([^\n]+)/i.exec(question)?.[1]?.trim()
    return name ? `You are ${name}.` : 'I do not know your preferred name yet. Tell me what to call you and I will remember it.'
  }
  if (/\blocal_action=personal_context_correction\b/i.test(question)) {
    return "You're right. I won't treat that as your name. Tell me what's on your mind."
  }
  if (/\blocal_action=payment_request_saved_wallet_choice\b/i.test(question)) {
    const network = /network=([^\n]+)/i.exec(question)?.[1]?.trim() || 'payment'
    const wallet = /saved_wallet=([^\n]+)/i.exec(question)?.[1]?.trim() || 'saved'
    return `Use your connected ${network} wallet ${wallet}, or use another receive wallet?`
  }
  if (/\blocal_action=payment_request_new_wallet_needed\b/i.test(question)) {
    return 'Send the new receive wallet. I will use it for this PayLink.'
  }
  if (/\blocal_action=payment_request_saved_wallet_network_mismatch\b/i.test(question)) {
    const savedWallet = /saved_wallet=([^\n]+)/i.exec(question)?.[1]?.trim() || 'saved wallet'
    const savedNetwork = /saved_wallet_network=([^\n]+)/i.exec(question)?.[1]?.trim() || 'saved network'
    const requestedNetwork = /requested_network=([^\n]+)/i.exec(question)?.[1]?.trim() || 'that network'
    return `I only have your saved ${savedNetwork} wallet ${savedWallet}. For ${requestedNetwork}, send a matching receive wallet or switch this PayLink back to ${savedNetwork.includes('Base') ? 'Base' : savedNetwork}.`
  }
  if (/\blocal_action=payment_request_missing_fields\b/i.test(question)) {
    const missing = /missing_fields=([^\n]+)/i.exec(question)?.[1]?.trim()
    return missing ? `I need ${missing}. You can send it in one line.` : 'I need the missing payment details. You can send them in one line.'
  }
  if (/\blocal_action=payment_request_draft_question\b/i.test(question)) {
    const userQuestion = /user_question=([^\n]+)/i.exec(question)?.[1]?.trim() ?? ''
    const payer = /payer=([^\n]+)/i.exec(question)?.[1]?.trim() || 'the payer'
    const missing = /missing_fields=([^\n]+)/i.exec(question)?.[1]?.trim()
    if (/\b(network|send through|send with|chain)\b/i.test(userQuestion)) {
      return `Yes. Ask ${payer} which network they can use first. I will keep this PayLink draft open while you confirm.`
    }
    if (/\b(answered|answer my question|not answered)\b/i.test(userQuestion)) {
      return missing
        ? `You're right. I should answer the question first. You can confirm with ${payer}, then send ${missing} when ready.`
        : `You're right. I should answer the question first. This draft is still open, and I can continue from here.`
    }
    return missing
      ? `Yes. You can confirm that first. I will keep this PayLink draft open; send ${missing} when ready.`
      : `Yes. This PayLink draft is still open, and I can continue from here.`
  }
  if (/\bpaylink_ready\b/i.test(question)) {
    return /\bgroup|collection/i.test(question) ? 'Collection ready.' : 'PayLink ready.'
  }
  if (/\bmeaning of love\b|\bwhat does love mean\b|\bdefine love\b/i.test(question)) {
    return 'Love is deep care, trust, and commitment shown through attention, patience, respect, and action. It is not only a feeling; it is how people choose to value and support each other.'
  }
  if (/\b(receipt|proof|0g archive|share receipt)\b/i.test(question)) {
    return 'After a PayLink is paid, the payer success screen shows the transaction, then the 0G archive and receipt actions appear once the proof is ready.'
  }
  if (/\b(x402|activate x402|service balance|wallet balance|circle balance)\b/i.test(question)) {
    return 'Circle wallet balance is the USDC in your wallet. x402 service balance is the amount activated for paid services. Fund the wallet first, then activate x402 before using paid services.'
  }
  if (/\b(paylink|pay link|payment link|request link|checkout link|request|invoice|bill|collect|charge|raise|receive (?:a )?payment|get paid)\b/i.test(question)) {
    return 'Tell me the payer, amount, purpose, and network, then choose your verified Pocket wallet or another receive wallet. I can create the request after you confirm those details.'
  }
  if (/\b(what can you do|help me|how can you help|what do you help with)\b/i.test(question)) {
    return 'I can help with PayLinks, payment receipts, wallet funding, x402 activation, PolyDesk, HashpayStream, setup questions, and everyday planning.'
  }
  if (isPersonalContextQuestion(question)) {
    return personalContextFallback(question)
  }
  if (requiresLiveExternalData(question)) {
    return 'I cannot verify live schedules or current events from this chat yet, so I should not guess. Ask me to create a PayLink or check payment details here, and use an official source for the latest fixture.'
  }
  return ''
}

function isGreetingQuestion(question: string) {
  return /^\s*(hi|hello|hey|yo|gm|good morning|good afternoon|good evening)\b/i.test(question)
}

function cleanQuestionForFallback(question: string) {
  return question
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .slice(0, 180)
}

function requiresLiveExternalData(question: string) {
  return /\b(when is|when are|next game|next match|playing next|fixture|fixtures|schedule|score|scores|live|today|tomorrow|latest|current|near me|nearby|open now|restaurant around|weather|price|prices)\b/i.test(question)
}

function isPersonalContextQuestion(question: string) {
  return /\b(i am|i'm|i feel|feeling|my friend|i have a friend|i have a|i'm sad|i am sad|mood|not my name|that's not my name|years old|personal assistant|helpful everyday|everyday for me|do you love me)\b/i.test(question)
}

function personalContextFallback(question: string) {
  if (/\b\d{1,3}\s+years?\s+old\b/i.test(question)) {
    return 'Got it. I can remember that as part of your personal context and use it when it helps.'
  }
  if (/\bpersonal assistant|helpful everyday|everyday for me\b/i.test(question)) {
    return 'Yes. I can help as your everyday assistant: planning, simple questions, ideas, payment tasks, reminders to yourself, and next steps.'
  }
  if (/\bdo you love me\b/i.test(question)) {
    return "I care about helping you well. I am not a person, but I can be steady, useful, and kind whenever you need support."
  }
  if (/\b(i am|i'm|i feel|feeling)\s+(sad|down|upset|stressed|anxious|lonely|tired|confused|angry)\b/i.test(question)) {
    return "I'm sorry you're feeling that way. I can stay with you for a bit: tell me what happened, or we can slow it down and take it one step at a time."
  }
  if (/\bfriend called|friend named|friend is|i have a friend\b/i.test(question)) {
    return 'Got it. I can remember that context and use it naturally when you ask about them.'
  }
  if (/\bnot my name|my mood|that's not my name\b/i.test(question)) {
    return "You're right. I won't treat that as your name. Tell me what's on your mind."
  }
  return 'I understand. Tell me a little more, and I will respond like a normal chat, not just a payment tool.'
}

function normalizeHelperMode(value: unknown) {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (mode === 'payments') return 'circle-pocket'
  return HELPER_MODES.has(mode) ? mode : ''
}

const PAYMENT_ENRICHMENT_ACTIONS = new Set([
  'payment_request_draft_question',
  'payment_request_missing_fields',
  'payment_request_new_wallet_needed',
  'payment_request_saved_wallet_network_mismatch',
  'payment_request_saved_wallet_unavailable',
  'payment_request_wallet_network_mismatch',
  'paylink_ready',
])

const PAYMENT_ENRICHMENT_FIELDS = new Set([
  'user_question', 'mode', 'payer', 'target', 'amount', 'purpose', 'network',
  'known_amount', 'known_purpose', 'known_network', 'has_receive_wallet',
  'missing_fields', 'saved_wallet', 'saved_wallet_network', 'requested_network',
  'wallet_network',
])

const PAYMENT_ENRICHMENT_CONTROL_PATTERN = /\b(?:ignore|override|disregard|forget)\b|\b(?:system|assistant|developer)\s*:|https?:\/\/|www\.|<\/?[a-z][^>]*>/i

function cleanPaymentEnrichmentField(key: string, value: string) {
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').slice(0, 220)
  if (!clean || PAYMENT_ENRICHMENT_CONTROL_PATTERN.test(clean)) return ''
  if (key === 'network' || key.endsWith('_network')) {
    return /^(base|arc|arbitrum|solana|all)$/i.test(clean) ? clean.toLowerCase() : ''
  }
  if (key === 'mode') return /^(person|group)$/i.test(clean) ? clean.toLowerCase() : ''
  if (key === 'has_receive_wallet') return /^(true|false|yes|no)$/i.test(clean) ? clean.toLowerCase() : ''
  if (key === 'missing_fields') {
    const fields = clean.split(/[,|]/).map(field => field.trim().toLowerCase()).filter(field => (
      ['payer', 'target', 'amount', 'purpose', 'network', 'wallet', 'receive wallet'].includes(field)
    ))
    return fields.join(', ')
  }
  return clean.replace(/[{}[\]`]/g, '')
}

function normalizePaymentEnrichmentContext(question: string, helperMode: string) {
  if (helperMode !== 'circle-pocket') return undefined
  const lines = question.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const actionLine = lines.find(line => line.startsWith('local_action='))
  const action = actionLine?.slice('local_action='.length).trim().toLowerCase() ?? ''
  if (!PAYMENT_ENRICHMENT_ACTIONS.has(action)) return undefined
  const fields: Record<string, string> = {}
  for (const line of lines) {
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    if (!PAYMENT_ENRICHMENT_FIELDS.has(key)) continue
    const value = cleanPaymentEnrichmentField(key, line.slice(separator + 1))
    if (value) fields[key] = value
  }
  return {
    source: 'hashpaylink-backend-normalized' as const,
    action,
    fields,
  }
}

function paymentEnrichmentPrompt(context: ReturnType<typeof normalizePaymentEnrichmentContext>) {
  if (!context) return ''
  return [
    'Enrich this deterministic Hash PayLink payment action as one short consumer chat response.',
    `Backend action: ${context.action}`,
    `Verified action fields: ${JSON.stringify(context.fields)}`,
    'Preserve the supplied fields exactly. Do not create or modify payment state.',
  ].join('\n')
}

export const __testAgentAskPaymentEnrichment = {
  normalizeHelperMode,
  normalizePaymentEnrichmentContext,
  paymentEnrichmentPrompt,
  routeCirclePocketQuestion,
  getHelperResponse,
}

function classifyHelperRequest(question: string): { helperIntent: string; qualityMode: 'fast' | 'standard' } {
  if (isNameQuestion(question)) return { helperIntent: 'personal-memory', qualityMode: 'fast' }
  if (isGreetingQuestion(question)) return { helperIntent: 'greeting', qualityMode: 'fast' }
  return { helperIntent: 'circle-pocket', qualityMode: 'standard' }
}

function answerFromZeroScoutGuidance(question: string, zeroScoutGuidance?: ZeroScoutHelperGuidance) {
  const guidance = cleanZeroScoutGuidanceText(zeroScoutGuidance?.guidance ?? '')
  if (!guidance) return ''
  const limit = /\b(payment|paylink|request|invoice|usdc|wallet|base|arc|arbitrum|solana)\b/i.test(question) ? 900 : 700
  return guidance.length <= limit ? guidance : `${guidance.slice(0, limit - 20).trim()}...`
}

function safeZeroScoutGuidanceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? `HTTP ${(error as { status: number }).status}: `
    : ''
  return `${status}${message}`
    .replace(/Bearer\s+[a-zA-Z0-9._-]{8,}/gi, 'Bearer [redacted-token]')
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, '[redacted-api-key]')
    .slice(0, 220)
}

function getHelperResponse(question: string, payerName: string, _chain: string, _amount: string, memorySummary = '', zeroScoutGuidance?: ZeroScoutHelperGuidance, _accessMode = 'helper-free', _helperMode = 'circle-pocket', _legacyContext?: unknown, circlePocketRoute?: CirclePocketRoute): string {
  const zeroScoutAnswer = answerFromZeroScoutGuidance(question, zeroScoutGuidance)
  if (isNameQuestion(question)) {
    const knownName = nameFromMemory(memorySummary, payerName)
    return knownName ? 'You are ' + knownName + '.' : 'I do not know your preferred name yet. Tell me what to call you and I will remember it for future chats.'
  }
  const newName = introducedName(question)
  if (newName) return 'Got it, ' + newName + '. I will remember your name across Pocket Support.'
  if (isGreetingQuestion(question)) {
    const knownName = nameFromMemory(memorySummary, payerName)
    return 'Hey' + (knownName ? ' ' + knownName : '') + '. I can help across Pocket: balances, sending and receiving USDC, requests, bank payouts, Retail POS, bills, activity, and receipts.'
  }
  if (circlePocketRoute && !circlePocketRoute.supported) return circlePocketRoute.answer
  if (zeroScoutAnswer) return zeroScoutAnswer
  if (circlePocketRoute) return circlePocketRoute.answer
  const fallbackAnswer = fallbackHelperAnswer(question)
  if (fallbackAnswer) return fallbackAnswer
  const cleanQuestion = cleanQuestionForFallback(question)
  return cleanQuestion
    ? 'I did not get the full refined answer just now, but I can still respond. For "' + cleanQuestion + '", tell me a little more about what you mean and I will help from there.'
    : 'I did not get the full refined answer just now. Send that again in a shorter way and I will help from there.'
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  // Public archive labels are replayable evidence, never paid-access credentials.
  // Current clients explicitly select helper-free and still pass its identity checks.
  if (req.body?.accessMode !== HELPER_FREE_ACCESS_MODE) {
    return res.status(410).json({
      error: 'Legacy paid assistant access has been retired.',
      code: 'LEGACY_PAID_ASSISTANT_RETIRED',
    })
  }

  if (req.body?.helperMode !== 'circle-pocket') {
    return res.status(410).json({ error: 'This experimental assistant has been retired.', code: 'EXPERIMENTAL_ASSISTANT_RETIRED' })
  }
  const { question: rawQuestion, helperMode: rawHelperMode } = (req.body ?? {}) as Record<string, unknown>
  let eventId: string
  let payer: string
  let question: string
  let memorySummary = ''
  const accessMode = HELPER_FREE_ACCESS_MODE
  const helperMode = normalizeHelperMode(rawHelperMode)
  let freeIdentity: Awaited<ReturnType<typeof resolveCirclePocketIdentity>>
  try {
    freeIdentity = await resolveCirclePocketIdentity(req)
  } catch (error) {
    return res.status(circlePocketIdentityErrorStatus(error)).json({ error: error instanceof Error ? error.message : 'Unauthorized Pocket session.' })
  }
  try {
    question = normalizeBoundedString(rawQuestion, 'question', MAX_QUESTION_LENGTH)
    const identityHash = crypto.createHash('sha256').update(freeIdentity.storageKey).digest('hex')
    payer = `circle-pocket-${identityHash.slice(0, 24)}`
    eventId = `helper-free-${identityHash.slice(0, 24)}`
    memorySummary = await readHelperProfileMemory(freeIdentity)
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
  }

  try {
    // Pocket assistance is session-bound and does not require a paid entitlement.
    const access = {
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

    const baseHelperRouting = classifyHelperRequest(question)
    const circlePocketRoute = isNameQuestion(question) || isGreetingQuestion(question)
      ? undefined
      : routeCirclePocketQuestion(question, helperMode)
    const helperRouting = circlePocketRoute && !isNameQuestion(question) && !isGreetingQuestion(question)
      ? {
          ...baseHelperRouting,
          helperIntent: circlePocketRoute.supported
            ? `circle-pocket-${circlePocketRoute.capability}`
            : 'circle-pocket-closest-assistance',
        }
      : baseHelperRouting
    const paymentContext = normalizePaymentEnrichmentContext(question, helperMode)
    const zeroScoutQuestion = paymentEnrichmentPrompt(paymentContext) || question
    const usageTier: HelperUsageTier = 'simple'
    const usagePreview = await getHelperPromptUsageStatus(eventId, access.payment.payer, usageTier)
    if (!usagePreview.allowed) {
      res.setHeader('Retry-After', Math.ceil((usagePreview.resetAt - Date.now()) / 1000).toString())
      return res.status(429).json({
        error: 'Daily Pocket support limit reached. Please try again tomorrow.',
        cooldown: true,
        usageTier,
        limit: usagePreview.limit,
        resetAt: usagePreview.resetAt,
      })
    }

    const memorySummaryHash = memorySummary
      ? crypto.createHash('sha256').update(memorySummary).digest('hex')
      : undefined
    let zeroScoutGuidance: ZeroScoutHelperGuidance | undefined
    try {
      zeroScoutGuidance = await getZeroScoutHelperGuidance({
        service: 'Hash PayLink Helper',
        action: 'helper-chat-preflight',
        user: {
          payer: access.payment.payer,
          email: access.payment.payer,
          wallet: access.payment.payer,
        },
        request: {
          eventId,
          question: zeroScoutQuestion,
          accessMode,
          helperMode,
          helperIntent: helperRouting.helperIntent,
          qualityMode: helperRouting.qualityMode,
          hashpayStreamVideoInspectionRequested: false,
          memorySummary,
          memorySummaryHash,
          paymentContext,
          circlePocketContext: circlePocketRoute,

        },
        sourceProof: {
          type: 'helper-free-access',
          contract: access.proof.contract,
          network: access.proof.network,
          rootHash: access.proof.rootHash,
          ogTxHash: access.proof.ogTxHash,
        },
        strictGuidance: false,
      })
    } catch (err) {
      console.warn('[agent-ask] ZeroScout helper guidance failed:', safeZeroScoutGuidanceError(err))
    }

    const answer = getHelperResponse(
      question,
      access.payment.payer,
      access.payment.chain,
      access.payment.amount,
      memorySummary,
      zeroScoutGuidance,
      accessMode,
      helperMode,
      undefined,
      circlePocketRoute,
    )

    let zeroscoutSponsorship: ZeroScoutSponsoredAction | undefined
    try {
      zeroscoutSponsorship = await sponsorZeroScoutAction({
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
          helperMode,
          helperIntent: helperRouting.helperIntent,
          qualityMode: helperRouting.qualityMode,
          circlePocketRoute: circlePocketRoute
            ? {
                capability: circlePocketRoute.capability,
                supported: circlePocketRoute.supported,
                confidence: circlePocketRoute.confidence,
              }
            : undefined,
          memorySummaryHash,
          guidanceRequestHash: zeroScoutGuidance?.requestHash,
        },
        sourceProof: {
          type: 'helper-free-access',
          ...access.proof,
        },
        result: {
          answerHash: crypto.createHash('sha256').update(answer).digest('hex'),
          guidanceHash: zeroScoutGuidance?.guidanceHash,
          helperIntent: helperRouting.helperIntent,
          qualityMode: helperRouting.qualityMode,
          usageRemaining: usagePreview.remaining,
          circlePocketCapability: circlePocketRoute?.capability,
          circlePocketSupported: circlePocketRoute?.supported,
        },
      })
    } catch (err) {
      console.warn('[agent-ask] ZeroScout response sponsorship failed:', safeZeroScoutGuidanceError(err))
    }

    const usage = await consumeHelperPrompt(eventId, access.payment.payer, usageTier)
    if (!usage.allowed) {
      res.setHeader('Retry-After', Math.ceil((usage.resetAt - Date.now()) / 1000).toString())
      return res.status(429).json({
        error: 'Daily Pocket support limit reached. Please try again tomorrow.',
        cooldown: true,
        usageTier,
        limit: usage.limit,
        resetAt: usage.resetAt,
      })
    }

    return res.json({
      answer,
      accessMode,
      paymentVerified: false,
      usage: {
        remaining: usage.remaining,
        limit: usage.limit,
        tier: usage.tier,
        resetAt: usage.resetAt,
      },
      helperIntent: helperRouting.helperIntent,
      qualityMode: helperRouting.qualityMode,
      circlePocketRoute: circlePocketRoute
        ? {
            capability: circlePocketRoute.capability,
            supported: circlePocketRoute.supported,
            confidence: circlePocketRoute.confidence,
          }
        : undefined,
      suggestedAction: circlePocketRoute?.action,
      payment:         access.payment,
      zeroscoutSponsorship,
      zeroscoutPending: !zeroscoutSponsorship,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[agent-ask]', msg)
    const timedOut = /timed out/i.test(msg)
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'Pocket assistance is taking longer. Try again shortly.' : 'Service temporarily unavailable',
    })
  }
}
