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
  ['show my wallet balance', 'circle-pocket-wallet-overview', '/home'],
  ['create a USDC payment link', 'circle-pocket-receive-usdc', '/move/usdc'],
  ['send 1 USDC to Lola', 'circle-pocket-send-usdc', '/home/send'],
  ['make a direct bank payout', 'circle-pocket-bank-payout', '/move/bank'],
  ['open a POS terminal', 'circle-pocket-retail-pos', '/move/pos'],
  ['buy airtime', 'circle-pocket-bills', '/bills/airtime'],
  ['buy mobile data', 'circle-pocket-bills', '/bills/data'],
  ['pay electricity', 'circle-pocket-bills', '/bills/electricity'],
  ['find my receipt', 'circle-pocket-receipts', '/activity'],
  ['show activity', 'circle-pocket-activity', '/activity'],
  ['show my payment requests', 'circle-pocket-payment-requests', '/activity/collections'],
  ['what is the USDC to Naira rate', 'circle-pocket-rates', '/profile?feature=rates'],
  ['show my daily spending limits', 'circle-pocket-spending-limits', '/profile?feature=limits'],
  ['enable push notifications', 'circle-pocket-notifications', '/profile?feature=notifications'],
  ['reset my Pocket PIN', 'circle-pocket-payment-security', '/profile?feature=security'],
  ['I need to speak to a human', 'circle-pocket-human-support', '/assistant'],
]

for (const [message, intent, href] of cases) {
  const result = await call(handler, { body: { threadId: 'pocket-thread-1', message } })
  assert.equal(result.statusCode, 200)
  assert.equal(isCirclePocketAgentResponse(result.payload), true)
  assert.equal(result.payload.intent, intent)
  assert.equal(result.payload.actions[0].href, href)
  assert.equal(result.payload.actions[0].href.startsWith('/'), true)
  assert.equal(result.payload.proof.readOnly, true)
}
assert.equal(verified, cases.length)

const memoryHandler = createPocketAgentAskHandler({
  async verifyUser() { return { userId: 'did:privy:returning-user', email: 'shy@example.com' } },
  async readMemory() { return 'User prefers to be called Shy.\nUser has a friend called Lola.' },
})
const remembered = await call(memoryHandler, { body: { threadId: 'pocket-thread-memory', message: 'what do you remember about me?' } })
assert.equal(remembered.statusCode, 200)
assert.match(remembered.payload.answer, /Shy/)
assert.match(remembered.payload.answer, /Lola/)
assert.equal(remembered.payload.proof.memoryAvailable, true)
const liveDataHandler = createPocketAgentAskHandler({
  async verifyUser() { return { userId: 'did:privy:live-data', email: 'live@example.com' } },
  async readRate() { return { rate: 1384.28, stale: false } },
  async readLimits() {
    return {
      bankPayout: { maxUsdc: 721.5, ngnEquivalent: 998_451.2 },
      bills: {
        airtime: { perPaymentNgn: 50_000, dailyLimitNgn: 200_000, usedTodayNgn: 20_000, remainingTodayNgn: 180_000 },
        otherBills: { dailyLimitNgn: 1_000_000, usedTodayNgn: 75_000, remainingTodayNgn: 925_000 },
      },
    }
  },
})
const liveRate = await call(liveDataHandler, { body: { threadId: 'pocket-thread-live', message: 'what is the USDC to Naira rate?' } })
assert.match(liveRate.payload.answer, /1 USDC = ₦1,384\.28/)
const liveLimits = await call(liveDataHandler, { body: { threadId: 'pocket-thread-live', message: 'how much of my limits have I used today?' } })
assert.match(liveLimits.payload.answer, /721\.5 USDC/)
assert.match(liveLimits.payload.answer, /₦20,000/)
assert.match(liveLimits.payload.answer, /₦925,000/)
const fallback = await call(handler, {
  body: { threadId: 'pocket-thread-1', message: 'write a poem about the moon' },
})
assert.equal(fallback.statusCode, 200)
assert.equal(fallback.payload.intent, 'circle-pocket-closest-assistance')
assert.equal(fallback.payload.proof.supported, false)

const legacyRoute = routeCirclePocketQuestion('find my receipt', 'circle-pocket')
assert.equal(legacyRoute?.action.url, '/activity')
assert.equal(routeCirclePocketQuestion('find my receipt', 'support'), undefined)
const preparedSend = routeCirclePocketQuestion('Send 0.5 USDC on Base to 0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce', 'circle-pocket')
assert.equal(preparedSend?.capability, 'send-usdc')
assert.equal(preparedSend?.action.url, '/home/send?recipient=0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce&mode=address&amount=0.5&network=base')
assert.match(preparedSend?.answer ?? '', /will not sign or submit/i)

const clientPayload = {
  answer: 'Open your Circle Pocket wallet.',
  intent: 'circle-pocket-wallet-overview',
  actions: [{ id: 'wallet-overview', label: 'Open Circle Pocket', href: '/pocket/move/usdc', style: 'primary' }],
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
const pocketSelectSource = await readFile(new URL('../src/pocket/components/PocketSelect.tsx', import.meta.url), 'utf8')
const verifiedBankFieldsSource = await readFile(new URL('../src/pocket/features/move/PocketVerifiedBankFields.tsx', import.meta.url), 'utf8')
const helperPanelSource = await readFile(new URL('../src/pages/TelegramPaymentLinks.tsx', import.meta.url), 'utf8')
const assistantControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketAssistantController.ts', import.meta.url), 'utf8')
const createLinkSource = await readFile(new URL('../src/pages/CreateLink.tsx', import.meta.url), 'utf8')
assert.match(pocketAppSource, /route\?\.section === 'assistant'.*PocketAssistantPage/)
assert.doesNotMatch(pocketAppSource, /CreateLink/)
assert.match(assistantPageSource, /TelegramHelperPanel/)
assert.match(assistantPageSource, /initialHelperMode='circle-pocket'/)
assert.match(assistantPageSource, /lockedHelperMode='circle-pocket'/)
assert.match(assistantPageSource, /fillAvailableHeight/)
assert.match(assistantPageSource, /Ask Agent Hash\.\.\./)
assert.doesNotMatch(assistantPageSource, /PolyDesk|PayLinkCard/)
assert.match(pocketSelectSource, /searchable.*searchPlaceholder/s)
assert.match(pocketSelectSource, /No matching options/)
assert.match(verifiedBankFieldsSource, /searchPlaceholder="Search banks"/)
assert.match(helperPanelSource, /isPocketAction.*pocket\.hashpaylink\.com/s)
assert.doesNotMatch(helperPanelSource, /url: 'https:\/\/pocket\.hashpaylink\.com/)
assert.match(assistantControllerSource, /askPocketAgent/)
assert.doesNotMatch(assistantControllerSource, /api\/agent-ask|telegram-request|ng-pos/)
assert.doesNotMatch(createLinkSource, /initialPocketRoute|pocketBasePath|startsInStandalonePocket|startsInPocketAssistant|navigatePocket/)
assert.match(createLinkSource, /agentHashRouteOpen/)
assert.match(createLinkSource, /Welcome to Agent Hash\. Ask about payments, wallets/)

console.log('pocket agent ask adapter smoke ok')
