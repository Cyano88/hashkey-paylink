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

  let seenPayload
  globalThis.fetch = async (_url, init) => {
    seenPayload = JSON.parse(String(init.body))
    return jsonResponse({
      id: 'zs_payment_lane_smoke',
      suggestedAnswer: 'Which network should Nana use?',
      summary: '0G Compute enriched the deterministic payment prompt.',
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
      eventId: 'payment-lane-smoke',
      question: 'local_action=payment_request_missing_fields\npayer=Nana\nmissing_fields=network',
      accessMode: 'helper-free',
      helperMode: 'payments',
      helperIntent: 'payment-help',
      qualityMode: 'standard',
      memorySummary: 'User is known as Shy.',
      memorySummaryHash: 'hash-memory',
    },
    sourceProof: { type: 'helper-free-access' },
  })
  const elapsedMs = Math.round(performance.now() - started)

  assert.equal(guidance?.zeroscout.id, 'zs_payment_lane_smoke')
  assert.equal(seenPayload?.data?.requestedRefinementLane, 'og-compute')
  assert.equal(seenPayload?.includeOpenAiReview, undefined)
  assert.equal(seenPayload?.includeClaudeReview, undefined)
  assert.equal(seenPayload?.data?.refinementPolicy, '0g-compute-compatible-model-fallback')
  assert.deepEqual(seenPayload?.data?.fallbackOrder, ['0g-compute'])
  assert.equal(seenPayload?.data?.modelRoutingPolicy?.owner, 'zeroscout')
  assert.equal(seenPayload?.data?.modelRoutingPolicy?.task, 'payment-assistance')
  assert.equal(seenPayload?.data?.modelRoutingPolicy?.lpEndpointsAllowed, false)
  assert.ok(seenPayload?.data?.helperModeInstructions?.some(line => line.includes('Never call, recommend, or imply LP Scout')))

  console.log(`zeroscout helper 0G payment lane smoke ok (${elapsedMs}ms local mocked roundtrip)`)
} finally {
  restore()
}
