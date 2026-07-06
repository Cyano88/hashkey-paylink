export type ZeroScoutPayload = {
  partner: string
  productType: string
  analysisType: string
  objective: string
  outputStyle: string
  data: Record<string, unknown>
  includeClaudeReview?: boolean
  includeOpenAiReview?: boolean
}

export type ZeroScoutIntelligenceResult = {
  id: string
  aiProvider?: string
  intelligenceScore?: number
  confidence?: number
  summary?: string
  suggestedAnswer?: string
  reasoningSummary?: string
  intent?: string
  missingFields?: string[]
  safetyBoundaries?: string[]
  proofMetadata?: Record<string, unknown>
  signals?: string[]
  riskFlags?: string[]
  recommendedActions?: string[]
  dataGaps?: string[]
  suggestedVisuals?: string[]
  disclaimer?: string
  claudeReview?: {
    provider?: string
    intelligenceRating?: number
    strengths?: string[]
    gaps?: string[]
    recommendation?: string
  }
  openAiReview?: {
    provider?: string
    intelligenceRating?: number
    strengths?: string[]
    gaps?: string[]
    recommendation?: string
  }
  proof?: {
    storageRoot?: string
    storageUri?: string
    contentHash?: string
    storageTxHash?: string
  }
  network?: string
  storageMode?: string
  createdAt?: string
}

const MAX_PAYLOAD_BYTES = 96_000
const DEFAULT_INTELLIGENCE_PATH = '/api/integrations/intelligence'
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.ZEROSCOUT_REQUEST_TIMEOUT_MS ?? 45_000) || 45_000)
const RETRY_ATTEMPTS = Math.max(0, Math.min(3, Number(process.env.ZEROSCOUT_RETRY_ATTEMPTS ?? 1) || 0))
const RETRY_DELAY_MS = Math.max(100, Number(process.env.ZEROSCOUT_RETRY_DELAY_MS ?? 500) || 500)

type ZeroScoutCallOptions = {
  requireProof?: boolean
  endpointPath?: string
  timeoutMs?: number
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function configuredEndpoint(endpointPath?: string) {
  const base = (process.env.ZEROSCOUT_API_URL ?? '').trim().replace(/\/+$/, '')
  if (!base) {
    const error = new Error('ZeroScout integration is not configured. Set ZEROSCOUT_API_URL on the server.') as Error & { status?: number }
    error.status = 503
    throw error
  }
  const path = (endpointPath ?? process.env.ZEROSCOUT_INTELLIGENCE_PATH ?? DEFAULT_INTELLIGENCE_PATH).trim() || DEFAULT_INTELLIGENCE_PATH
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function hasZeroScoutProof(result: ZeroScoutIntelligenceResult) {
  return Boolean(
    result.proof
    && (
      result.proof.contentHash
      || result.proof.storageRoot
      || result.proof.storageTxHash
      || result.proof.storageUri
    ),
  )
}

function validateZeroScoutResult(value: unknown, options: ZeroScoutCallOptions): ZeroScoutIntelligenceResult {
  if (!value || typeof value !== 'object') {
    const error = new Error('ZeroScout returned an invalid response object.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  const result = value as ZeroScoutIntelligenceResult
  if (typeof result.id !== 'string' || !result.id.trim()) {
    const error = new Error('ZeroScout response is missing result id.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  for (const [field, fieldValue] of Object.entries({
    signals: result.signals,
    riskFlags: result.riskFlags,
    recommendedActions: result.recommendedActions,
    dataGaps: result.dataGaps,
    suggestedVisuals: result.suggestedVisuals,
  })) {
    if (fieldValue !== undefined && !isStringArray(fieldValue)) {
      const error = new Error(`ZeroScout response field ${field} must be an array of strings.`) as Error & { status?: number }
      error.status = 502
      throw error
    }
  }
  if (result.proof !== undefined && (typeof result.proof !== 'object' || result.proof === null)) {
    const error = new Error('ZeroScout response proof must be an object when supplied.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  if (options.requireProof && !hasZeroScoutProof(result)) {
    const error = new Error('ZeroScout response is missing stored proof metadata.') as Error & { status?: number }
    error.status = 502
    throw error
  }
  return result
}

function shouldRetry(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : 0
  return !status || status === 408 || status === 429 || status >= 500
}

export async function callZeroScoutIntelligence(payload: ZeroScoutPayload, options: ZeroScoutCallOptions = {}): Promise<ZeroScoutIntelligenceResult> {
  const endpoint = configuredEndpoint(options.endpointPath)
  const secret = (process.env.ZEROSCOUT_INTEGRATION_SECRET ?? '').trim()
  if (!secret) {
    const error = new Error('ZeroScout integration is not configured. Set ZEROSCOUT_INTEGRATION_SECRET on the server.') as Error & { status?: number }
    error.status = 503
    throw error
  }

  const body = JSON.stringify(payload)
  if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
    const error = new Error('ZeroScout payload is too large. Send a summarized request under 96 KB.') as Error & { status?: number }
    error.status = 413
    throw error
  }

  const requestId = cryptoRandomId()
  const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS)
  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
          'x-hashpaylink-request-id': requestId,
          'x-hashpaylink-analysis-type': payload.analysisType,
        },
        body,
        signal: controller.signal,
      })
      const text = await response.text()
      let json: Record<string, unknown>
      try {
        json = text ? JSON.parse(text) as Record<string, unknown> : {}
      } catch {
        const error = new Error(`ZeroScout returned non-JSON response: ${text.slice(0, 180)}`) as Error & { status?: number }
        error.status = 502
        throw error
      }
      if (!response.ok) {
        const message = typeof json.error === 'string' ? json.error : `ZeroScout request failed with HTTP ${response.status}`
        const error = new Error(message) as Error & { status?: number }
        error.status = response.status
        throw error
      }
      return validateZeroScoutResult(json, options)
    } catch (err) {
      lastError = err
      if (attempt >= RETRY_ATTEMPTS || !shouldRetry(err)) break
      await sleep(RETRY_DELAY_MS * (attempt + 1))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('ZeroScout request failed.')
}

function cryptoRandomId() {
  return `hpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
