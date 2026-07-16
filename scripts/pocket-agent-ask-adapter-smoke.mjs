import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [{ createPocketAgentAskHandler }, { isCirclePocketAgentResponse }, { routeCirclePocketQuestion }, { askPocketAgent, parsePocketAgentResponse }] = await Promise.all([
  import('../api/pocket/agent-ask.ts'),
  import('../src/pocket/lib/pocketSchemas.ts'),
  import('../api/pocket/agent-router.ts'),
  import('../src/pocket/api/pocketAgentClient.ts'),
])

async function call(handler, { method = 'POST', headers = {}, body = {} } = {}) {
  let statusCode = 200
  let payload
  await handler({ method, headers, body }, {
    status(code) { statusCode = code; return this },
    json(value) { payload = value; return this },
  })
  return { statusCode, payload }
}

let verified = 0
const handler = createPocketAgentAskHandler({
  async verifyUser() {
    verified += 1
    return { userId: 'did:privy:pocket-agent-smoke', email: 'pocket@example.com' }
  },
})

const missingAuthHandler = createPocketAgentAskHandler({
  async verifyUser() { throw Object.assign(new Error('Missing Privy session.'), { status: 401 }) },
})
const unauthorized = await call(missingAuthHandler, {
  body: { threadId: 'pocket-thread-1', message: 'Show my wallet balance' },
})
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.payload.error.code, 'AUTH_REQUIRED')

const invalid = await call(handler, { body: { threadId: '../bad', message: 'wallet' } })
assert.equal(invalid.statusCode, 400)
assert.equal(verified, 0)

const bodyToken = await call(handler, {
  body: { threadId: 'pocket-thread-1', message: 'wallet', identityToken: 'body-token-is-not-auth' },
})
assert.equal(bodyToken.statusCode, 400)
assert.equal(verified, 0)

const mutation = await call(handler, {
  body: { threadId: 'pocket-thread-1', message: 'send money', draft: { amount: '5' } },
})
assert.equal(mutation.statusCode, 400)
assert.match(mutation.payload.error.message, /read-only/i)
assert.equal(verified, 0)

const cases = [
  ['show my wallet balance', 'circle-pocket-wallet-overview', '/pocket/home/smart-wallet'],
  ['create a USDC payment link', 'circle-pocket-receive-usdc', '/pocket/move/usdc'],
  ['receive into my bank account', 'circle-pocket-bank-payout', '/pocket/move/bank'],
  ['open a POS terminal', 'circle-pocket-retail-pos', '/pocket/move/pos'],
  ['buy airtime', 'circle-pocket-bills', '/pocket/bills/airtime'],
  ['fund my x402 wallet', 'circle-pocket-x402-wallet', '/pocket/home/x402'],
  ['find my receipt', 'circle-pocket-receipts', '/pocket/activity'],
]

for (const [message, intent, href] of cases) {
  const result = await call(handler, { body: { threadId: 'pocket-thread-1', message } })
  assert.equal(result.statusCode, 200)
  assert.equal(isCirclePocketAgentResponse(result.payload), true)
  assert.equal(result.payload.intent, intent)
  assert.equal(result.payload.actions[0].href, href)
  assert.equal(result.payload.proof.readOnly, true)
}
assert.equal(verified, cases.length)

const fallback = await call(handler, {
  body: { threadId: 'pocket-thread-1', message: 'write a poem about the moon' },
})
assert.equal(fallback.statusCode, 200)
assert.equal(fallback.payload.intent, 'circle-pocket-closest-assistance')
assert.equal(fallback.payload.proof.supported, false)

const legacyRoute = routeCirclePocketQuestion('find my receipt', 'circle-pocket')
assert.equal(legacyRoute?.action.url, '/pocket/activity')
assert.equal(routeCirclePocketQuestion('find my receipt', 'support'), undefined)

const clientPayload = {
  answer: 'Open your Circle Pocket wallet.',
  intent: 'circle-pocket-wallet-overview',
  actions: [{ id: 'wallet-overview', label: 'Open Circle Pocket', href: '/pocket/home/smart-wallet', style: 'primary' }],
}
let clientRequest
const clientResult = await askPocketAgent({
  accessToken: 'privy-access-token',
  threadId: 'pocket-thread-2',
  message: 'show my wallet',
  fetcher: async (url, init) => {
    clientRequest = { url, init }
    return { ok: true, async json() { return clientPayload } }
  },
})
assert.equal(clientResult.intent, clientPayload.intent)
assert.equal(clientRequest.url, '/api/pocket/agent/ask')
assert.equal(clientRequest.init.headers.authorization, 'Bearer privy-access-token')
assert.deepEqual(JSON.parse(clientRequest.init.body), {
  threadId: 'pocket-thread-2',
  message: 'show my wallet',
})
assert.throws(() => parsePocketAgentResponse({ answer: 'missing intent' }), /invalid/i)

const pocketAppSource = await readFile(new URL('../src/pocket/CirclePocketApp.tsx', import.meta.url), 'utf8')
const assistantPageSource = await readFile(new URL('../src/pocket/pages/PocketAssistantPage.tsx', import.meta.url), 'utf8')
const assistantControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketAssistantController.ts', import.meta.url), 'utf8')
const createLinkSource = await readFile(new URL('../src/pages/CreateLink.tsx', import.meta.url), 'utf8')
assert.match(pocketAppSource, /route\.section === 'assistant'.*PocketAssistantPage/)
assert.doesNotMatch(pocketAppSource, /CreateLink/)
assert.match(assistantPageSource, /Circle Pocket is ready\. Ask me to receive USDC/)
assert.match(assistantPageSource, /Ask about Circle Pocket\.\.\./)
assert.doesNotMatch(assistantPageSource, /TelegramHelperPanel|ZeroScout|PolyDesk|PayLinkCard/)
assert.match(assistantControllerSource, /askPocketAgent/)
assert.doesNotMatch(assistantControllerSource, /api\/agent-ask|telegram-request|ng-pos/)
assert.doesNotMatch(createLinkSource, /initialPocketRoute|pocketBasePath|startsInStandalonePocket|startsInPocketAssistant|navigatePocket/)
assert.match(createLinkSource, /agentHashRouteOpen/)
assert.match(createLinkSource, /Welcome to Agent Hash\. Ask about payments, wallets/)

console.log('pocket agent ask adapter smoke ok')
