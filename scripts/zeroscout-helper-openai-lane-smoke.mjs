import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

function restore() {
  process.env = { ...originalEnv }
  if (originalFetch) globalThis.fetch = originalFetch
  else delete globalThis.fetch
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }
}

try {
  process.env.ZEROSCOUT_API_URL = 'https://zeroscout.test'
  process.env.ZEROSCOUT_INTEGRATION_SECRET = 'test-secret'
  process.env.ZEROSCOUT_RETRY_ATTEMPTS = '0'
  process.env.ZEROSCOUT_REQUEST_TIMEOUT_MS = '5000'
  process.env.ZEROSCOUT_HELPER_REFINEMENT_LANE = 'openai'

  let seenPayload
  globalThis.fetch = async (_url, init) => {
    seenPayload = JSON.parse(String(init.body))
    return jsonResponse({
      id: 'zs_openai_lane_smoke',
      suggestedAnswer: 'OpenAI lane smoke response.',
      summary: 'OpenAI lane selected for simple helper refinement.',
      signals: [],
      riskFlags: [],
      recommendedActions: [],
      dataGaps: [],
    })
  }

  const { getZeroScoutHelperGuidance } = await import('../api/zeroscout-sponsored-action.ts')
  const started = performance.now()
  const guidance = await getZeroScoutHelperGuidance({
    service: 'Hash PayLink Helper',
    action: 'helper-chat-preflight',
    user: { payer: 'Shy' },
    request: {
      eventId: 'openai-lane-smoke',
      question: 'hello',
      accessMode: 'helper-free',
      helperIntent: 'greeting',
      qualityMode: 'fast',
      memorySummary: 'User is known as Shy.',
      memorySummaryHash: 'hash-memory',
    },
    sourceProof: { type: 'helper-free-access' },
  })
  const elapsedMs = Math.round(performance.now() - started)

  assert.equal(guidance?.zeroscout.id, 'zs_openai_lane_smoke')
  assert.equal(seenPayload?.data?.requestedRefinementLane, 'openai')
  assert.equal(seenPayload?.includeOpenAiReview, true)
  assert.equal(seenPayload?.includeClaudeReview, false)
  assert.equal(seenPayload?.data?.refinementPolicy, 'single-lane-short-refinement')

  console.log(`zeroscout helper openai lane smoke ok (${elapsedMs}ms local mocked roundtrip)`)
} finally {
  restore()
}
