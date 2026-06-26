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
    memorySummary?: string
    memorySummaryHash?: string
  }
  sourceProof?: Record<string, unknown>
}

export type ZeroScoutSponsoredAction = {
  proofClass: 'zeroscout_sponsored_action'
  sponsor: 'ZeroScout'
  service: string
  action: string
  requestHash: string
  sponsoredAt: string
  sourceProofClass?: 'helper_access_receipt' | 'helper_memory_proof' | 'service_receipt'
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

const SPONSOR_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_SPONSOR_TIMEOUT_MS ?? 10_000))
const GUIDANCE_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_HELPER_GUIDANCE_TIMEOUT_MS ?? 6_000))
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
  const lines = [
    result.summary,
    ...(result.signals ?? []).slice(0, 4).map(item => `Signal: ${item}`),
    ...(result.recommendedActions ?? []).slice(0, 4).map(item => `Use: ${item}`),
    ...(result.riskFlags ?? []).slice(0, 3).map(item => `Boundary: ${item}`),
    ...(result.dataGaps ?? []).slice(0, 3).map(item => `Missing: ${item}`),
  ]
  return lines.filter(Boolean).join('\n').slice(0, 1_600)
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
  const request = {
    eventId: input.request.eventId,
    question: sanitizeHelperContext(input.request.question),
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
    const zeroscout = await withTimeout(callZeroScoutIntelligence({
      partner: 'Hash PayLink',
      productType: 'agentic-service',
      analysisType: 'zeroscout-helper-context-guidance',
      objective: 'Return concise guidance that helps Hash PayLink helper personalize the response while respecting payment, wallet, LP Scout, and x402 boundaries.',
      outputStyle: 'helper-context-guidance',
      data: {
        proofClass: 'zeroscout_helper_context_guidance',
        service: input.service,
        action: input.action,
        user: cleanUser(input.user),
        requestHash: hash,
        request,
        sourceProof: input.sourceProof,
        separationRules: [
          'This is helper context guidance only, not LP Scout paid proof.',
          'Do not claim Circle wallet balance, x402 service balance, x402 activation, paid-service access, receipt status, or LP Scout proof unless supplied by verified app state.',
          'Keep Circle wallet balance, x402 service balance, Activate x402, paid services, and LP Scout proof/payment requirements distinct.',
          'Do not infer live prices, wallet balances, secrets, payment proofs, or user identity beyond supplied fields.',
        ],
      },
      includeClaudeReview: false,
      includeOpenAiReview: false,
    }), GUIDANCE_TIMEOUT_MS)

    const guidance = buildGuidanceText(zeroscout)
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
        separationRules: [
          'This is ZeroScout-sponsored helper or service context, not LP Scout paid proof.',
          'LP Scout operator signals still require a saved Polymarket LP Scout result and matching x402 payment proof.',
          'Do not infer live prices, wallet balances, or market data that were not supplied.',
        ],
      },
      includeClaudeReview: false,
      includeOpenAiReview: false,
    }), SPONSOR_TIMEOUT_MS)

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
