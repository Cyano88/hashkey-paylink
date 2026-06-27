import crypto from 'node:crypto'
import { callZeroScoutIntelligence, type ZeroScoutIntelligenceResult } from './zeroscout-intelligence.js'

type ZeroScoutSponsoredActionInput = {
  service: string
  action: string
  user?: {
    payer?: string
    email?: string
    wallet?: string
  }
  request: Record<string, unknown>
  sourceProof?: Record<string, unknown>
  result?: Record<string, unknown>
}

type ZeroScoutHelperGuidanceInput = {
  service: string
  action: string
  user?: ZeroScoutSponsoredActionInput['user']
  request: {
    eventId: string
    question: string
    accessMode?: string
    helperMode?: string
    helperIntent?: string
    qualityMode?: 'fast' | 'standard' | 'deep'
    memorySummary?: string
    memorySummaryHash?: string
  }
  sourceProof?: Record<string, unknown>
  strictGuidance?: boolean
}

export type ZeroScoutSponsoredAction = {
  proofClass: 'zeroscout_sponsored_action'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  sponsoredAt: string
  sourceProofClass?: 'helper_access_receipt' | 'helper_free_access' | 'helper_memory_proof' | 'service_receipt'
  zeroscout: ZeroScoutIntelligenceResult
}

export type ZeroScoutHelperGuidance = {
  proofClass: 'zeroscout_helper_context_guidance'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  guidanceHash: string
  guidedAt: string
  guidance: string
  zeroscout: ZeroScoutIntelligenceResult
}

const SPONSOR_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_SPONSOR_TIMEOUT_MS ?? 30_000))
const FAST_SPONSOR_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_FAST_SPONSOR_TIMEOUT_MS ?? 1_500))
const MAX_GUIDANCE_CONTEXT_LENGTH = 900

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function requestHash(value: unknown) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function cleanUser(input: ZeroScoutSponsoredActionInput['user']) {
  const payer = String(input?.payer ?? '').trim().slice(0, 160)
  const email = String(input?.email ?? '').trim().toLowerCase().slice(0, 160)
  const wallet = String(input?.wallet ?? '').trim().slice(0, 96)
  return {
    ...(payer ? { payer } : {}),
    ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
    ...(wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet) ? { wallet } : {}),
  }
}

function sourceProofClass(proof: Record<string, unknown> | undefined): ZeroScoutSponsoredAction['sourceProofClass'] | undefined {
  const source = String(proof?.source ?? proof?.type ?? '').toLowerCase()
  if (source.includes('helper-free')) return 'helper_free_access'
  if (source.includes('helper-memory')) return 'helper_memory_proof'
  if (source.includes('helper') || proof?.ogTxHash || proof?.rootHash) return 'helper_access_receipt'
  if (proof) return 'service_receipt'
  return undefined
}

function sanitizeHelperContext(input: string | undefined) {
  const value = String(input ?? '')
    .replace(/sk-[a-zA-Z0-9_-]{16,}/g, '[redacted-api-key]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]{16,}/gi, 'Bearer [redacted-token]')
    .replace(/0x[a-fA-F0-9]{64}/g, '[redacted-private-token]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]')
    .replace(/\s+/g, ' ')
    .trim()
  return value.slice(0, MAX_GUIDANCE_CONTEXT_LENGTH)
}

function buildGuidanceText(result: ZeroScoutIntelligenceResult) {
  const extra = result as ZeroScoutIntelligenceResult & {
    guidance?: string
    answer?: string
    message?: string
    response?: string
    result?: {
      suggestedAnswer?: string
      guidance?: string
      answer?: string
      message?: string
      summary?: string
    }
  }
  const lines = [
    result.suggestedAnswer,
    extra.guidance,
    extra.answer,
    extra.message,
    extra.response,
    extra.result?.suggestedAnswer,
    extra.result?.guidance,
    extra.result?.answer,
    extra.result?.message,
    result.summary,
    extra.result?.summary,
  ]
  return Array.from(new Set(lines.map(item => String(item ?? '').trim()).filter(Boolean)))
    .join('\n')
    .slice(0, 1_000)
}

function shouldUseDeepHelperReview(input: ZeroScoutHelperGuidanceInput) {
  return input.request.qualityMode === 'deep'
}

type HelperRefinementLane = 'og-compute' | 'openai' | 'anthropic' | 'multi-stack'

function forcedSimpleHelperLane(): HelperRefinementLane | undefined {
  const lane = String(process.env.ZEROSCOUT_HELPER_REFINEMENT_LANE ?? '').trim().toLowerCase()
  if (lane === 'og-compute' || lane === 'openai' || lane === 'anthropic') return lane
  return undefined
}

function helperRefinementLane(input: ZeroScoutHelperGuidanceInput): HelperRefinementLane {
  if (shouldUseDeepHelperReview(input)) return 'multi-stack'
  if (input.request.qualityMode === 'fast') return 'og-compute'
  const helperMode = String(input.request.helperMode ?? '').trim().toLowerCase()
  if (helperMode === 'payments' || helperMode === 'daily' || helperMode === 'services' || helperMode === 'support') return 'og-compute'
  const forcedLane = forcedSimpleHelperLane()
  if (forcedLane) return forcedLane
  const seed = requestHash({
    eventId: input.request.eventId,
    question: input.request.question,
    helperIntent: input.request.helperIntent,
    memorySummaryHash: input.request.memorySummaryHash,
  })
  const bucket = parseInt(seed.slice(0, 2), 16) % 3
  if (bucket === 1) return 'openai'
  if (bucket === 2) return 'anthropic'
  return 'og-compute'
}

function helperFallbackOrder(lane: HelperRefinementLane) {
  if (lane === 'multi-stack') return ['0g-compute', 'openai', 'anthropic', 'local']
  if (lane === 'openai') return ['openai', '0g-compute', 'anthropic', 'local']
  if (lane === 'anthropic') return ['anthropic', '0g-compute', 'openai', 'local']
  return ['0g-compute', 'openai', 'anthropic', 'local']
}

function helperReviewFlags(lane: HelperRefinementLane) {
  return {
    includeClaudeReview: lane === 'multi-stack' || lane === 'anthropic',
    includeOpenAiReview: lane === 'multi-stack' || lane === 'openai',
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ZeroScout sponsorship timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function getZeroScoutHelperGuidance(input: ZeroScoutHelperGuidanceInput): Promise<ZeroScoutHelperGuidance | undefined> {
  const sanitizedMemorySummary = sanitizeHelperContext(input.request.memorySummary)
  const refinementLane = helperRefinementLane(input)
  const reviewFlags = helperReviewFlags(refinementLane)
  const request = {
    eventId: input.request.eventId,
    question: sanitizeHelperContext(input.request.question),
    accessMode: input.request.accessMode,
    helperMode: input.request.helperMode,
    helperIntent: input.request.helperIntent,
    qualityMode: input.request.qualityMode,
    memorySummary: sanitizedMemorySummary || undefined,
    memorySummaryHash: input.request.memorySummaryHash,
  }
  const hash = requestHash({
    service: input.service,
    action: input.action,
    user: cleanUser(input.user),
    request,
  })

  try {
    const zeroscout = await callZeroScoutIntelligence({
      partner: 'Hash PayLink',
      productType: 'agentic-service',
      analysisType: 'zeroscout-helper-context-guidance',
      objective: 'Return a concise, consumer-friendly Ask Hash chat answer plan. Be direct, human, and useful. Answer ordinary everyday questions cleanly. For live schedules, prices, current events, restaurants, or other freshness-sensitive requests, answer only if verified data is available in the request or ZeroScout can verify it; otherwise say plainly that live verification is not available from this chat. Personal identity questions should be answered only from supplied memory/profile context; if unknown, say that naturally. Payment-link requests should be practical and minimal. Respect payment, wallet, LP Scout, and x402 proof boundaries.',
      outputStyle: 'consumer-helper-answer-guidance',
      data: {
        proofClass: 'zeroscout_helper_context_guidance',
        service: input.service,
        action: input.action,
        user: cleanUser(input.user),
        requestHash: hash,
        request,
        sourceProof: input.sourceProof,
        helperIntent: input.request.helperIntent,
        helperMode: input.request.helperMode,
        qualityMode: input.request.qualityMode ?? 'standard',
        refinementPolicy: refinementLane === 'multi-stack'
          ? 'deep-multi-stack-0g-anthropic-openai'
          : 'single-lane-short-refinement',
        requestedRefinementLane: refinementLane,
        fallbackOrder: helperFallbackOrder(refinementLane),
        separationRules: [
          'This is helper context guidance only, not LP Scout paid proof.',
          'For general-helper or greeting intent, answer the user directly instead of returning a product capability menu.',
          'Do not mention ZeroScout sponsorship requirements in user-facing answer text.',
          'Do not return generic product strategy when the user asks a simple personal, payment, or setup question.',
          'Do not claim Circle wallet balance, x402 service balance, x402 activation, paid-service access, receipt status, or LP Scout proof unless supplied by verified app state.',
          'Keep Circle wallet balance, x402 service balance, Activate x402, paid services, and LP Scout proof/payment requirements distinct.',
          'Do not infer live schedules, prices, wallet balances, secrets, payment proofs, or user identity beyond supplied fields.',
        ],
      },
      includeClaudeReview: reviewFlags.includeClaudeReview,
      includeOpenAiReview: reviewFlags.includeOpenAiReview,
    })

    const guidance = buildGuidanceText(zeroscout)
    if (input.strictGuidance && !guidance) {
      const error = new Error('ZeroScout helper guidance response did not include suggestedAnswer, guidance, answer, message, response, or summary.') as Error & { status?: number }
      error.status = 502
      throw error
    }
    const guidanceHash = requestHash({
      requestHash: hash,
      summary: zeroscout.summary,
      signals: zeroscout.signals,
      riskFlags: zeroscout.riskFlags,
      recommendedActions: zeroscout.recommendedActions,
      dataGaps: zeroscout.dataGaps,
    })

    return {
      proofClass: 'zeroscout_helper_context_guidance',
      sponsor: 'ZeroScout',
      service: input.service,
      action: input.action,
      requestHash: hash,
      guidanceHash,
      guidedAt: new Date().toISOString(),
      guidance,
      zeroscout,
    }
  } catch (err) {
    console.warn('[zeroscout-helper-guidance] skipped:', err instanceof Error ? err.message : String(err))
    if (input.strictGuidance) throw err
    return undefined
  }
}

export async function sponsorZeroScoutAction(input: ZeroScoutSponsoredActionInput): Promise<ZeroScoutSponsoredAction | undefined> {
  const hash = requestHash({
    service: input.service,
    action: input.action,
    user: cleanUser(input.user),
    request: input.request,
  })

  try {
    const qualityMode = String(input.request?.qualityMode ?? '')
    const timeoutMs = qualityMode === 'deep' ? SPONSOR_TIMEOUT_MS : FAST_SPONSOR_TIMEOUT_MS
    const zeroscout = await withTimeout(callZeroScoutIntelligence({
      partner: 'Hash PayLink',
      productType: 'agentic-service',
      analysisType: 'zeroscout-sponsored-action',
      objective: 'Create a concise sponsorship annotation for a Hash PayLink helper, chat, or service action without treating it as LP Scout paid proof.',
      outputStyle: 'sponsorship-receipt',
      data: {
        proofClass: 'zeroscout_sponsored_action',
        service: input.service,
        action: input.action,
        user: cleanUser(input.user),
        requestHash: hash,
        request: input.request,
        sourceProof: input.sourceProof,
        result: input.result,
        refinementPolicy: 'proof-only-no-review',
        separationRules: [
          'This is ZeroScout-sponsored helper or service context, not LP Scout paid proof.',
          'LP Scout operator signals still require a saved Polymarket LP Scout result and matching x402 payment proof.',
          'Do not infer live prices, wallet balances, or market data that were not supplied.',
        ],
      },
      includeClaudeReview: false,
      includeOpenAiReview: false,
    }, { requireProof: true, endpointPath: '/api/integrations/sponsorship-proof' }), timeoutMs)

    return {
      proofClass: 'zeroscout_sponsored_action',
      sponsor: 'ZeroScout',
      service: input.service,
      action: input.action,
      requestHash: hash,
      sponsoredAt: new Date().toISOString(),
      sourceProofClass: sourceProofClass(input.sourceProof),
      zeroscout,
    }
  } catch (err) {
    console.warn('[zeroscout-sponsored-action] skipped:', err instanceof Error ? err.message : String(err))
    return undefined
  }
}
