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

const SPONSOR_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_SPONSOR_TIMEOUT_MS ?? 10_000))

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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ZeroScout sponsorship timed out')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
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
