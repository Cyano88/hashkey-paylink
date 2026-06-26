import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch

process.env.ZEROSCOUT_RETRY_ATTEMPTS = '0'
process.env.ZEROSCOUT_REQUEST_TIMEOUT_MS = '2000'

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

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(value) {
      this.body = value
      return this
    },
  }
}

async function expectRejectsStatus(fn, status, match) {
  let caught
  try {
    await fn()
  } catch (err) {
    caught = err
  }
  assert(caught instanceof Error, 'expected an error')
  assert.equal(caught.status, status)
  if (match) assert.match(caught.message, match)
}

const intelligence = await import('../api/zeroscout-intelligence.ts')
const sponsored = await import('../api/zeroscout-sponsored-action.ts')

try {
  delete process.env.ZEROSCOUT_API_URL
  delete process.env.ZEROSCOUT_INTEGRATION_SECRET
  await expectRejectsStatus(
    () => intelligence.callZeroScoutIntelligence({
      partner: 'Hash PayLink',
      productType: 'agentic-service',
      analysisType: 'zeroscout-contract-smoke',
      objective: 'smoke',
      outputStyle: 'json',
      data: {},
    }),
    503,
    /ZEROSCOUT_API_URL/,
  )

  process.env.ZEROSCOUT_API_URL = 'https://zeroscout.test'
  delete process.env.ZEROSCOUT_INTEGRATION_SECRET
  await expectRejectsStatus(
    () => intelligence.callZeroScoutIntelligence({
      partner: 'Hash PayLink',
      productType: 'agentic-service',
      analysisType: 'zeroscout-contract-smoke',
      objective: 'smoke',
      outputStyle: 'json',
      data: {},
    }),
    503,
    /ZEROSCOUT_INTEGRATION_SECRET/,
  )

  process.env.ZEROSCOUT_INTEGRATION_SECRET = 'test-secret'
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    return jsonResponse({
      id: 'zs_valid_sponsorship',
      summary: 'Sponsored helper response.',
      signals: ['helper access receipt verified'],
      riskFlags: [],
      recommendedActions: ['answer with proof boundaries'],
      dataGaps: [],
      proof: {
        contentHash: '0xabc123',
        storageRoot: '0xdef456',
        storageTxHash: '0x789abc',
      },
      network: 'ZeroScout',
      storageMode: '0g',
      createdAt: new Date().toISOString(),
    })
  }
  const valid = await sponsored.sponsorZeroScoutAction({
    service: 'Hash PayLink Helper',
    action: 'helper-chat-response',
    user: {
      payer: '0x0000000000000000000000000000000000000001',
      wallet: '0x0000000000000000000000000000000000000001',
      email: 'ask@example.com',
    },
    request: {
      eventId: 'helper-smoke',
      question: 'How should I create a payment link?',
      memorySummaryHash: 'hash-memory',
    },
    sourceProof: {
      type: 'helper_access_receipt',
      rootHash: '0xroot',
      ogTxHash: '0xog',
    },
    result: {
      answerHash: 'hash-answer',
      usageRemaining: 19,
    },
  })
  assert.equal(valid?.proofClass, 'zeroscout_sponsored_action')
  assert.equal(valid?.zeroscout.proof?.contentHash, '0xabc123')
  assert.equal(seen[0].url, 'https://zeroscout.test/api/integrations/intelligence')
  assert.equal(seen[0].init.headers.authorization, 'Bearer test-secret')
  assert.equal(seen[0].init.headers['x-hashpaylink-analysis-type'], 'zeroscout-sponsored-action')

  globalThis.fetch = async () => jsonResponse({
    id: 'zs_missing_proof',
    summary: 'This should not count as a final sponsorship.',
    signals: [],
    riskFlags: [],
    recommendedActions: [],
    dataGaps: [],
  })
  const invalid = await sponsored.sponsorZeroScoutAction({
    service: 'Hash PayLink Helper',
    action: 'helper-chat-response',
    request: { eventId: 'helper-smoke', question: 'test' },
    result: { answerHash: 'hash-answer' },
  })
  assert.equal(invalid, undefined, 'missing ZeroScout proof must block helper final sponsorship')

  const tmp = await mkdtemp(join(tmpdir(), 'hpl-zs-'))
  process.env.AGENT_WALLET_PROVISION_STORE = join(tmp, 'agent-store.json')
  const { appendAgentActivity } = await import('../api/agent-activity.ts')
  const { default: lpHandler } = await import('../api/zeroscout-polymarket-brief.ts')
  const scout = await appendAgentActivity({
    agentSlug: 'contract-smoke',
    type: 'scout_returned',
    title: 'Paid LP Scout result',
    direction: 'result',
    serviceUrl: '/api/x402/polymarket-scout?scoutMode=best',
    result: {
      summary: 'LP scout data exists but no matching x402 payment proof exists.',
      signals: ['spread is tight'],
    },
  })
  assert(scout?.id)
  const res = mockRes()
  await lpHandler({
    method: 'POST',
    body: {
      agentSlug: 'contract-smoke',
      activityId: scout.id,
    },
  }, res)
  assert.equal(res.statusCode, 403)
  assert.match(res.body?.error ?? '', /No matching x402 payment proof/)
  await rm(tmp, { recursive: true, force: true })

  console.log('zeroscout contract smoke ok')
} finally {
  restore()
}
