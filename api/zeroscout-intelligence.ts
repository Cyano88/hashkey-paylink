type ZeroScoutPayload = {
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

export async function callZeroScoutIntelligence(payload: ZeroScoutPayload): Promise<ZeroScoutIntelligenceResult> {
  const baseUrl = (process.env.ZEROSCOUT_API_URL ?? 'https://zeroscout.app').replace(/\/+$/, '')
  const secret = (process.env.ZEROSCOUT_INTEGRATION_SECRET ?? '').trim()
  if (!secret) {
    const error = new Error('ZeroScout integration is not configured. Set ZEROSCOUT_INTEGRATION_SECRET on the server.') as Error & { status?: number }
    error.status = 503
    throw error
  }

  const body = JSON.stringify(payload)
  if (Buffer.byteLength(body, 'utf8') > MAX_PAYLOAD_BYTES) {
    const error = new Error('ZeroScout payload is too large. Send a summarized LP scout result under 96 KB.') as Error & { status?: number }
    error.status = 413
    throw error
  }

  const response = await fetch(`${baseUrl}/api/integrations/intelligence`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body,
  })
  const text = await response.text()
  let json: Record<string, unknown>
  try {
    json = text ? JSON.parse(text) as Record<string, unknown> : {}
  } catch {
    throw new Error(`ZeroScout returned non-JSON response: ${text.slice(0, 180)}`)
  }
  if (!response.ok) {
    const message = typeof json.error === 'string' ? json.error : `ZeroScout request failed with HTTP ${response.status}`
    const error = new Error(message) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return json as ZeroScoutIntelligenceResult
}
