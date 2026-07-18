import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import {
  POCKET_API,
  POCKET_ROUTES,
  createPocketIdempotencyKey,
  isCirclePocketAgentRequest,
  isCirclePocketAgentResponse,
  isPocketActivityReadData,
  isPocketBalancesReadData,
  isPocketIdempotencyKey,
  isPocketMutationResult,
  isPocketProfileUpsertRequest,
  isPocketWalletLinkMutationData,
  isPocketWalletLinkMutationRequest,
  isPocketWalletsReadData,
  pocketLegacyEntryUrl,
  pocketPathFor,
  resolvePocketRoute,
} from '../src/pocket/lib/index.ts'
import { buildPocketPayLink } from '../src/pocket/lib/pocketPayLinkBuilder.ts'
import { resolvePocketControllerStatus } from '../src/pocket/controllers/usePocketMoveControllers.ts'
import { validatePocketWithdrawal } from '../src/pocket/controllers/pocketWithdrawalValidation.ts'
import {
  normalizePocketAmountInput,
  resolvePocketUsdcDraft,
} from '../src/pocket/controllers/pocketUsdcDraftValidation.ts'
import { readablePocketBankPayoutError } from '../src/pocket/controllers/pocketBankErrors.ts'
import {
  normalizePocketX402Amount,
  pocketX402ActivationError,
} from '../src/pocket/controllers/pocketX402Validation.ts'
import { buildPocketX402FundUrl } from '../src/pocket/lib/pocketX402FundUrl.ts'
import {
  POCKET_COMMAND_KINDS,
  POCKET_COMMAND_POLICIES,
  isPocketCommandKind,
  pocketCommandPolicy,
} from '../src/pocket/commands/pocketCommandContracts.ts'
import {
  parsePocketActivityRead,
  parsePocketLocalCurrencyProfileRead,
  parsePocketLocalCurrencyProfileSave,
  readPocketActivity,
  readPocketBalances,
  readPocketLinkedWallets,
  readPocketLocalCurrencyProfile,
  readPocketRecipientBalance,
  savePocketLocalCurrencyProfile,
} from '../src/pocket/api/pocketReadClient.ts'
import {
  linkPocketWallet,
  parsePocketWalletLinkMutation,
  parsePocketWalletsRead,
  readPocketWallet,
  readPocketWallets,
  unlinkPocketWallet,
} from '../src/pocket/api/pocketWalletLinkClient.ts'
import { parsePocketFxQuote, readPocketFxQuote } from '../src/pocket/api/pocketFxClient.ts'
import { createPocketFxQuoteReader } from '../api/pocket/fx-quote.ts'

async function readPocketSourceTree(directoryUrl) {
  const sources = []
  const entries = await readdir(directoryUrl, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directoryUrl)
    if (entry.isDirectory()) {
      sources.push(...await readPocketSourceTree(entryUrl))
    } else if (/\.tsx?$/.test(entry.name)) {
      sources.push({ path: entryUrl.pathname, source: await readFile(entryUrl, 'utf8') })
    }
  }
  return sources
}

const routeCases = [
  ['/', { section: 'home', view: 'smart-wallet' }],
  ['/home/smart-wallet', { section: 'home', view: 'smart-wallet' }],
  ['/home/x402/', { section: 'home', view: 'x402' }],
  ['/move/usdc?amount=5', { section: 'move', view: 'usdc' }],
  ['/move/bank', { section: 'move', view: 'bank' }],
  ['/move/pos', { section: 'move', view: 'pos' }],
  ['/bills/airtime', { section: 'bills', view: 'airtime' }],
  ['/bills/data', { section: 'bills', view: 'data' }],
  ['/bills/tv', { section: 'bills', view: 'tv' }],
  ['/bills/electricity', { section: 'bills', view: 'electricity' }],
  ['/activity', { section: 'activity', view: 'all' }],
  ['/activity/bank', { section: 'activity', view: 'bank' }],
  ['/activity/pos', { section: 'activity', view: 'pos' }],
  ['/activity/bills', { section: 'activity', view: 'bills' }],
  ['/assistant', { section: 'assistant', view: 'circle-pocket' }],
]

for (const [path, expected] of routeCases) {
  const resolved = resolvePocketRoute(path)
  assert.deepEqual(resolved, expected)
  assert.ok(resolved)
  assert.deepEqual(resolvePocketRoute(pocketPathFor(resolved)), expected)
}

const fxEnvelope = {
  ok: true,
  quote: {
    currency: 'NGN',
    symbol: '₦',
    amount: '1.309814',
    rate: 1373.43,
    source: 'paycrest',
    side: 'sell',
    quotedAt: 1_800_000_000_000,
    expiresAt: 1_800_000_060_000,
  },
}
assert.deepEqual(parsePocketFxQuote(fxEnvelope), fxEnvelope.quote)
assert.throws(() => parsePocketFxQuote({ ...fxEnvelope, quote: { ...fxEnvelope.quote, source: 'fixer' } }), /invalid/)
let fxClientUrl = ''
assert.deepEqual(await readPocketFxQuote('1.309814', async url => {
  fxClientUrl = String(url)
  return { ok: true, json: async () => fxEnvelope }
}), fxEnvelope.quote)
assert.equal(fxClientUrl, '/api/pocket/fx-quote?currency=NGN&amount=1.309814')

let fxNow = 1_800_000_000_000
let paycrestRateCalls = 0
let paycrestRateUnavailable = false
const readFxQuote = createPocketFxQuoteReader({
  now: () => fxNow,
  fetcher: async url => {
    paycrestRateCalls += 1
    assert.equal(String(url), 'https://api.paycrest.io/v2/rates/base/USDC/1.309814/NGN?side=sell')
    if (paycrestRateUnavailable) {
      return { ok: false, json: async () => ({ status: 'error', message: 'Rate unavailable' }) }
    }
    return {
      ok: true,
      json: async () => ({ status: 'success', data: { sell: { rate: '1373.43' } } }),
    }
  },
})
const [firstFxQuote, deduplicatedFxQuote] = await Promise.all([readFxQuote('1.309814'), readFxQuote('1.309814')])
assert.deepEqual(firstFxQuote, deduplicatedFxQuote)
assert.equal(paycrestRateCalls, 1)
fxNow += 29_999
assert.deepEqual(await readFxQuote('1.309814'), firstFxQuote)
assert.equal(paycrestRateCalls, 1)
fxNow += 2
paycrestRateUnavailable = true
await assert.rejects(readFxQuote('1.309814'), /Rate unavailable/)
assert.equal(paycrestRateCalls, 2)

assert.equal(resolvePocketRoute('/unknown'), null)
assert.equal(pocketLegacyEntryUrl({ section: 'move', view: 'bank' }), '/?product=circle-pocket&pocket=move%3Abank')
assert.equal(pocketLegacyEntryUrl({ section: 'assistant', view: 'circle-pocket' }), '/?product=circle-pocket&agent=hash')

assert.deepEqual(validatePocketWithdrawal({
  network: 'base',
  address: '0x1111111111111111111111111111111111111111',
  amount: '1.25',
  balance: 2,
}), {
  recipient: '0x1111111111111111111111111111111111111111',
  amountUnits: 1_250_000n,
})
assert.throws(
  () => validatePocketWithdrawal({ network: 'base', address: 'invalid', amount: '1', balance: 2 }),
  /Enter a valid destination address for the selected network\./,
)

assert.equal(normalizePocketAmountInput('1,2.3 USDC'), '1.23')
assert.deepEqual(resolvePocketUsdcDraft({
  network: 'base',
  multiChain: false,
  flexibleAmount: false,
  amount: '1.25',
  evmAddress: '0x1111111111111111111111111111111111111111',
  solanaAddress: '',
}), {
  evmDirty: true,
  solanaDirty: false,
  amountDirty: true,
  evmValid: true,
  solanaValid: false,
  amountValid: true,
  canGenerate: true,
  addressGuidance: undefined,
})
assert.equal(resolvePocketUsdcDraft({
  network: 'solana',
  multiChain: false,
  flexibleAmount: true,
  amount: '',
  evmAddress: '',
  solanaAddress: '',
}).addressGuidance, 'Enter a Solana address to continue')
assert.equal(resolvePocketUsdcDraft({
  network: 'base',
  multiChain: true,
  flexibleAmount: true,
  amount: '',
  evmAddress: '',
  solanaAddress: '11111111111111111111111111111111',
}).canGenerate, true)
assert.equal(
  readablePocketBankPayoutError(new Error('Paycrest provider unavailable'), 'fallback'),
  'provider unavailable',
)
assert.equal(
  readablePocketBankPayoutError(new Error('PAYCREST_API_KEY is not configured'), 'fallback'),
  'Bank payouts are temporarily unavailable. Please try again later.',
)

assert.equal(buildPocketPayLink({
  origin: 'https://hashpaylink.com',
  network: 'base',
  multiChain: false,
  flexibleAmount: false,
  amount: '12.5',
  evmAddress: '0x1111111111111111111111111111111111111111',
  solanaAddress: '',
  memo: 'Invoice 42',
}), 'https://hashpaylink.com/pay?n=base&a=12.5&e=0x1111111111111111111111111111111111111111&m=Invoice+42')
assert.equal(buildPocketPayLink({
  origin: 'https://hashpaylink.com',
  network: 'solana',
  multiChain: true,
  flexibleAmount: true,
  amount: '',
  evmAddress: '0x2222222222222222222222222222222222222222',
  solanaAddress: '11111111111111111111111111111111',
  memo: '',
  eventMode: true,
  eventId: 'event-1',
  fx: { shown: true, currency: 'NGN', source: 'custom', customRate: '1550' },
  agentUrl: 'https://agent.example/ask',
}), 'https://hashpaylink.com/pay?x=1&f=1&e=0x2222222222222222222222222222222222222222&s=11111111111111111111111111111111&v=1&id=event-1&fx=NGN&fs=1&xs=custom&xr=1550&g=https%3A%2F%2Fagent.example%2Fask')
assert.throws(
  () => validatePocketWithdrawal({ network: 'base', address: '0x1111111111111111111111111111111111111111', amount: '0', balance: 2 }),
  /Enter an amount to withdraw\./,
)
assert.throws(
  () => validatePocketWithdrawal({ network: 'base', address: '0x1111111111111111111111111111111111111111', amount: '2.01', balance: 2 }),
  /Amount is higher than your wallet balance\./,
)

assert.equal(new Set(Object.values(POCKET_ROUTES)).size, Object.values(POCKET_ROUTES).length)
assert.ok(Object.values(POCKET_API).every(path => path.startsWith('/api/pocket/')))
assert.equal(new Set(Object.values(POCKET_API)).size, Object.values(POCKET_API).length)
assert.equal(POCKET_API.profile, '/api/pocket/profile')
assert.equal(isPocketProfileUpsertRequest({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
}), true)
assert.equal(isPocketProfileUpsertRequest({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  expectedUpdatedAt: '2026-07-15T00:00:00.000Z',
}), true)
assert.equal(isPocketProfileUpsertRequest({ firstName: 'Ada', lastName: '', email: 'invalid' }), false)
const walletLinkRequest = {
  action: 'link',
  network: 'base',
  circleUserToken: 'circle-user-token',
  wallet: {
    id: 'circle-wallet-1',
    address: '0x1111111111111111111111111111111111111111',
    blockchain: 'BASE',
  },
}
assert.equal(isPocketWalletLinkMutationRequest(walletLinkRequest), true)
assert.equal(isPocketWalletLinkMutationRequest({ ...walletLinkRequest, circleUserToken: '' }), false)
assert.equal(isPocketWalletLinkMutationRequest({ ...walletLinkRequest, network: 'polygon' }), false)
assert.equal(isPocketWalletLinkMutationRequest({
  action: 'unlink', network: 'solana', expectedUpdatedAt: 1_752_537_600_000,
}), true)
assert.equal(isPocketWalletLinkMutationRequest({
  action: 'unlink', network: 'solana', expectedUpdatedAt: 'stale',
}), false)
const walletLinkData = {
  link: {
    network: 'base',
    wallet: walletLinkRequest.wallet,
    updatedAt: 1_752_537_600_000,
  },
  unchanged: false,
}
assert.equal(isPocketWalletLinkMutationData(walletLinkData), true)
assert.equal(isPocketWalletLinkMutationData({ ...walletLinkData, link: { ...walletLinkData.link, updatedAt: -1 } }), false)
assert.equal(isPocketWalletLinkMutationData({ link: null, unchanged: true }), true)
const walletsReadData = { wallets: { base: walletLinkData.link } }
assert.equal(isPocketWalletsReadData(walletsReadData), true)
assert.equal(isPocketWalletsReadData({ wallets: { polygon: { ...walletLinkData.link, network: 'polygon' } } }), false)
assert.equal(isPocketWalletsReadData({ wallets: { base: { ...walletLinkData.link, network: 'solana' } } }), false)

const idempotencyKey = createPocketIdempotencyKey('bank receive', 'test-request-00000001')
assert.equal(isPocketIdempotencyKey(idempotencyKey), true)
assert.equal(isPocketIdempotencyKey('short'), false)

assert.equal(isPocketMutationResult({
  ok: true,
  requestId: 'request-1',
  idempotencyKey,
  status: 'completed',
  data: { payUrl: 'https://hashpaylink.com/pay?id=1' },
}), true)
assert.equal(isPocketMutationResult({
  ok: false,
  requestId: 'request-2',
  idempotencyKey,
  status: 'failed',
  error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.', retryable: false },
}), true)
assert.equal(isPocketMutationResult({
  ok: true,
  requestId: 'request-3',
  idempotencyKey,
  status: 'failed',
}), false)

assert.equal(isCirclePocketAgentRequest({
  threadId: 'mode:circle-pocket',
  message: 'Request 5 USDC from Chioma for breakfast on Base.',
  locale: 'en-NG',
}), true)
assert.equal(isCirclePocketAgentRequest({ threadId: '', message: 'Hi' }), false)

assert.equal(isCirclePocketAgentResponse({
  answer: 'Your PayLink draft is ready for confirmation.',
  intent: 'create-usdc-paylink',
  missingFields: [],
  confirmation: {
    id: 'confirmation-1',
    summary: 'Request 5 USDC from Chioma on Base for breakfast.',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
  actions: [{ id: 'confirm', label: 'Confirm', style: 'primary' }],
}), true)
assert.equal(isCirclePocketAgentResponse({ answer: '', intent: 'unknown' }), false)

assert.equal(resolvePocketControllerStatus({ canSubmit: false, submitting: false, completed: false }), 'blocked')
assert.equal(resolvePocketControllerStatus({ canSubmit: true, submitting: false, completed: false }), 'ready')
assert.equal(resolvePocketControllerStatus({ canSubmit: true, submitting: true, completed: false }), 'submitting')
assert.equal(resolvePocketControllerStatus({ canSubmit: false, submitting: false, completed: true }), 'completed')

assert.equal(Object.keys(POCKET_COMMAND_POLICIES).length, POCKET_COMMAND_KINDS.length)
assert.ok(POCKET_COMMAND_KINDS.every(isPocketCommandKind))
assert.equal(isPocketCommandKind('paylink invented command'), false)
assert.deepEqual(pocketCommandPolicy('pos.create'), {
  transport: '/api/pocket/pos',
  transportAuth: 'privy-bearer',
  idempotency: 'required',
  approval: 'form-submit',
  risk: 'financial-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('bank-receive.create'), {
  transport: '/api/pocket/bank-receive',
  transportAuth: 'privy-bearer',
  idempotency: 'required',
  approval: 'form-submit',
  risk: 'financial-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('bank-send.create'), {
  transport: '/api/pocket/bank-send',
  transportAuth: 'privy-bearer',
  idempotency: 'required',
  approval: 'form-submit',
  risk: 'financial-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('bank.verify'), {
  transport: '/api/pocket/bank-receive/verify',
  transportAuth: 'privy-bearer',
  idempotency: 'absent',
  approval: 'form-submit',
  risk: 'sensitive-data-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('withdraw.evm'), {
  transport: 'executePocketEvmTransfer',
  transportAuth: 'circle-wallet-session',
  idempotency: 'absent',
  approval: 'wallet-signature',
  risk: 'financial-write',
  execution: 'circle-wallet-client',
})
assert.deepEqual(pocketCommandPolicy('withdraw.solana.prepare'), {
  transport: '/api/pocket/transfers/prepare',
  transportAuth: 'privy-bearer',
  idempotency: 'absent',
  approval: 'wallet-signature',
  risk: 'financial-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('withdraw.solana.submit'), {
  transport: '/api/pocket/transfers/submit',
  transportAuth: 'privy-bearer',
  idempotency: 'absent',
  approval: 'signed-payload',
  risk: 'financial-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('x402.wallet.connect.init'), {
  transport: '/api/pocket/x402/connect',
  action: 'init',
  transportAuth: 'privy-bearer',
  idempotency: 'absent',
  approval: 'form-submit',
  risk: 'identity-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('x402.wallet.connect.complete'), {
  transport: '/api/pocket/x402/connect',
  action: 'complete',
  transportAuth: 'privy-bearer',
  idempotency: 'absent',
  approval: 'form-submit',
  risk: 'identity-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('x402.gateway.activate'), {
  transport: '/api/pocket/x402/activate',
  transportAuth: 'privy-bearer',
  idempotency: 'required',
  approval: 'form-submit',
  risk: 'financial-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('profile.save'), {
  transport: '/api/pocket/profile',
  transportAuth: 'privy-bearer',
  idempotency: 'required',
  approval: 'form-submit',
  risk: 'sensitive-data-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('wallet.link'), {
  transport: '/api/pocket/wallets/link',
  action: 'link',
  transportAuth: 'privy-bearer',
  idempotency: 'required',
  approval: 'form-submit',
  risk: 'identity-write',
  execution: 'pocket-adapter',
})
assert.deepEqual(pocketCommandPolicy('wallet.unlink'), {
  transport: '/api/pocket/wallets/link',
  action: 'unlink',
  transportAuth: 'privy-bearer',
  idempotency: 'required',
  approval: 'form-submit',
  risk: 'identity-write',
  execution: 'pocket-adapter',
})
assert.equal(Object.values(POCKET_COMMAND_POLICIES).filter(policy => policy.execution === 'legacy-page-only').length, 0)
assert.ok(Object.values(POCKET_COMMAND_POLICIES).every(policy => !Object.values(policy).some(value => typeof value === 'function')))

assert.equal(normalizePocketX402Amount('1,23456789 USDC'), '1.234567')
assert.equal(pocketX402ActivationError('0.49'), 'Minimum x402 top up is 0.5 USDC.')
assert.equal(pocketX402ActivationError('5.01'), 'Maximum x402 top up is 5 USDC.')
assert.equal(pocketX402ActivationError('2', '1.5'), 'Amount is higher than the current wallet balance.')
assert.equal(pocketX402ActivationError('1.5', '2'), '')
const pocketX402FundUrl = new URL(buildPocketX402FundUrl({
  origin: 'https://hashpaylink.com',
  network: 'arc',
  walletAddress: '0x1111111111111111111111111111111111111111',
  now: 1_800_000_000_001,
}), 'https://hashpaylink.com')
assert.equal(pocketX402FundUrl.pathname, '/pay')
assert.equal(pocketX402FundUrl.searchParams.get('n'), 'arc')
assert.equal(pocketX402FundUrl.searchParams.get('e'), '0x1111111111111111111111111111111111111111')
assert.equal(pocketX402FundUrl.searchParams.get('walletManager'), 'service')
assert.equal(pocketX402FundUrl.searchParams.get('g'), 'https://hashpaylink.com/pocket/home/x402')
assert.equal(pocketX402FundUrl.searchParams.has('agentSlug'), false)
const pocketBaseX402FundUrl = new URL(buildPocketX402FundUrl({
  origin: 'https://hashpaylink.com',
  network: 'base',
  walletAddress: '0x2222222222222222222222222222222222222222',
  now: 1_800_000_000_002,
}), 'https://hashpaylink.com')
assert.equal(pocketBaseX402FundUrl.searchParams.get('n'), 'base')

assert.deepEqual(parsePocketLocalCurrencyProfileRead({
  ok: true,
  email: 'ada@example.com',
  profile: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', updatedAt: '2026-07-15T00:00:00.000Z' },
}), {
  email: 'ada@example.com',
  profile: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', updatedAt: '2026-07-15T00:00:00.000Z' },
})
assert.deepEqual(parsePocketLocalCurrencyProfileRead({ ok: true, email: 'ada@example.com', profile: null }), {
  email: 'ada@example.com',
  profile: null,
})
assert.throws(() => parsePocketLocalCurrencyProfileRead({ ok: true, profile: { firstName: 'Ada' } }), /Profile response was invalid/)
assert.throws(() => parsePocketLocalCurrencyProfileRead({ ok: false, error: 'Session expired.' }), /Session expired/)
let profileReadRequest
const profileReadResult = await readPocketLocalCurrencyProfile({
  accessToken: 'test-access-token',
  fetcher: async (url, init) => {
    profileReadRequest = { url, init }
    return { ok: true, json: async () => ({ ok: true, email: 'ada@example.com', profile: null }) }
  },
})
assert.deepEqual(profileReadResult, { email: 'ada@example.com', profile: null })
assert.equal(profileReadRequest.url, '/api/pocket/profile')
assert.equal(profileReadRequest.init.method, 'GET')
assert.equal(profileReadRequest.init.headers.authorization, 'Bearer test-access-token')
assert.equal(profileReadRequest.init.body, undefined)
const profileSaveEnvelope = {
  ok: true,
  requestId: 'profile-request-1',
  idempotencyKey: 'pocket:profile-save:test-request-00000001',
  status: 'completed',
  data: {
    profile: { firstName: 'Ada', lastName: 'Byron', email: 'ada@example.com', updatedAt: '2026-07-15T00:00:01.000Z' },
    unchanged: false,
  },
}
assert.deepEqual(parsePocketLocalCurrencyProfileSave(profileSaveEnvelope), profileSaveEnvelope.data)
let profileSaveRequest
const profileSaveResult = await savePocketLocalCurrencyProfile({
  accessToken: 'test-access-token',
  profile: { firstName: 'Ada', lastName: 'Byron', email: 'ada@example.com' },
  expectedUpdatedAt: '2026-07-15T00:00:00.000Z',
  idempotencyKey: profileSaveEnvelope.idempotencyKey,
  fetcher: async (url, init) => {
    profileSaveRequest = { url, init }
    return { ok: true, json: async () => profileSaveEnvelope }
  },
})
assert.deepEqual(profileSaveResult, profileSaveEnvelope.data)
assert.equal(profileSaveRequest.url, '/api/pocket/profile')
assert.equal(profileSaveRequest.init.headers['idempotency-key'], profileSaveEnvelope.idempotencyKey)
assert.deepEqual(JSON.parse(profileSaveRequest.init.body), {
  firstName: 'Ada',
  lastName: 'Byron',
  email: 'ada@example.com',
  expectedUpdatedAt: '2026-07-15T00:00:00.000Z',
})
const walletLinkEnvelope = {
  ok: true,
  requestId: 'wallet-link-request-1',
  idempotencyKey: 'pocket:wallet-link:test-request-00000001',
  status: 'completed',
  data: {
    link: {
      network: 'base',
      wallet: {
        id: 'circle-wallet-1',
        address: '0x1111111111111111111111111111111111111111',
        blockchain: 'BASE',
      },
      updatedAt: 1_800_000_000_001,
    },
    unchanged: false,
  },
}
assert.deepEqual(parsePocketWalletLinkMutation(walletLinkEnvelope), walletLinkEnvelope.data)
assert.throws(() => parsePocketWalletLinkMutation({ ...walletLinkEnvelope, data: { unchanged: false } }), /response was invalid/)
let walletLinkFetch
const walletLinkResult = await linkPocketWallet({
  accessToken: 'test-access-token',
  network: 'base',
  circleUserToken: 'circle-user-token-secret',
  wallet: walletLinkEnvelope.data.link.wallet,
  expectedUpdatedAt: 1_800_000_000_000,
  idempotencyKey: walletLinkEnvelope.idempotencyKey,
  fetcher: async (url, init) => {
    walletLinkFetch = { url, init }
    return { ok: true, json: async () => walletLinkEnvelope }
  },
})
assert.deepEqual(walletLinkResult, walletLinkEnvelope.data)
assert.equal(walletLinkFetch.url, '/api/pocket/wallets/link')
assert.equal(walletLinkFetch.init.headers.authorization, 'Bearer test-access-token')
assert.equal(walletLinkFetch.init.headers['idempotency-key'], walletLinkEnvelope.idempotencyKey)
assert.deepEqual(JSON.parse(walletLinkFetch.init.body), {
  action: 'link',
  network: 'base',
  circleUserToken: 'circle-user-token-secret',
  wallet: walletLinkEnvelope.data.link.wallet,
  expectedUpdatedAt: 1_800_000_000_000,
})
let walletUnlinkRequest
const walletUnlinkEnvelope = {
  ...walletLinkEnvelope,
  requestId: 'wallet-unlink-request-1',
  idempotencyKey: 'pocket:wallet-unlink:test-request-00000001',
  data: { link: null, unchanged: false },
}
assert.deepEqual(await unlinkPocketWallet({
  accessToken: 'test-access-token',
  network: 'base',
  expectedUpdatedAt: walletLinkEnvelope.data.link.updatedAt,
  idempotencyKey: walletUnlinkEnvelope.idempotencyKey,
  fetcher: async (url, init) => {
    walletUnlinkRequest = { url, init }
    return { ok: true, json: async () => walletUnlinkEnvelope }
  },
}), walletUnlinkEnvelope.data)
assert.deepEqual(JSON.parse(walletUnlinkRequest.init.body), {
  action: 'unlink', network: 'base', expectedUpdatedAt: walletLinkEnvelope.data.link.updatedAt,
})
const walletsReadEnvelope = {
  ok: true,
  wallets: {
    base: walletLinkEnvelope.data.link,
  },
}
assert.deepEqual(parsePocketWalletsRead(walletsReadEnvelope), { wallets: walletsReadEnvelope.wallets })
assert.throws(() => parsePocketWalletsRead({ ok: true, wallets: { base: { network: 'base' } } }), /response was invalid/)
let walletsReadRequest
assert.deepEqual(await readPocketWallets({
  accessToken: 'wallet-read-token',
  fetcher: async (url, init) => {
    walletsReadRequest = { url, init }
    return { ok: true, json: async () => walletsReadEnvelope }
  },
}), { wallets: walletsReadEnvelope.wallets })
assert.equal(walletsReadRequest.url, '/api/pocket/wallets')
assert.equal(walletsReadRequest.init.method, 'GET')
assert.equal(walletsReadRequest.init.headers.authorization, 'Bearer wallet-read-token')
assert.equal(walletsReadRequest.init.body, undefined)
assert.deepEqual(await readPocketWallet({
  accessToken: 'wallet-read-token',
  network: 'base',
  fetcher: async () => ({ ok: true, json: async () => walletsReadEnvelope }),
}), walletLinkEnvelope.data.link)
assert.equal(await readPocketWallet({
  accessToken: 'wallet-read-token',
  network: 'solana',
  fetcher: async () => ({ ok: true, json: async () => walletsReadEnvelope }),
}), null)
const activityRow = {
  eventId: 'ngpos-merchant-1',
  txHash: '0xactivity',
  chain: 'base',
  payer: 'Circle wallet payer',
  memo: 'Retail POS payment',
  amount: '2.5',
  ts: 1_720_000_000_000,
  source: 'ngpos',
}
assert.deepEqual(parsePocketActivityRead({ ok: true, payments: [activityRow] }), { payments: [activityRow] })
assert.equal(isPocketActivityReadData({ payments: [activityRow] }), true)
assert.equal(isPocketActivityReadData({ payments: [{ ...activityRow, ts: -1 }] }), false)
assert.throws(() => parsePocketActivityRead({ ok: true }), /activity response was invalid/i)
assert.throws(() => parsePocketActivityRead({ ok: true, payments: [{ eventId: 'missing-fields' }] }), /activity response was invalid/i)
assert.throws(() => parsePocketActivityRead({ ok: false, error: 'Activity unavailable.' }), /Activity unavailable/)
let activityReadRequest
const activityReadResult = await readPocketActivity({
  accessToken: 'test-activity-token',
  fetcher: async (url, init) => {
    activityReadRequest = { url, init }
    return { ok: true, json: async () => ({ ok: true, payments: [activityRow] }) }
  },
})
assert.deepEqual(activityReadResult, { payments: [activityRow] })
assert.equal(activityReadRequest.url, '/api/pocket/activity')
assert.equal(activityReadRequest.init.method, 'GET')
assert.equal(activityReadRequest.init.headers.authorization, 'Bearer test-activity-token')
assert.equal(activityReadRequest.init.body, undefined)
const balancesEnvelope = {
  ok: true,
  total: 5,
  rows: [
    { key: 'base', label: 'Base', balance: 2, status: 'ok' },
    { key: 'arbitrum', label: 'Arbitrum', balance: 0, status: 'ok' },
    { key: 'arc', label: 'Arc', balance: 0, status: 'error', error: 'Arc balance is temporarily unavailable.' },
    { key: 'solana', label: 'Solana', balance: 3, status: 'ok' },
  ],
}
assert.equal(isPocketBalancesReadData(balancesEnvelope), true)
assert.equal(isPocketBalancesReadData({ ...balancesEnvelope, rows: balancesEnvelope.rows.slice(0, 3) }), false)
assert.equal(isPocketBalancesReadData({ ...balancesEnvelope, total: -1 }), false)
assert.equal(isPocketBalancesReadData({ ...balancesEnvelope, total: 6 }), false)
let pocketBalancesRequest
const pocketBalanceResult = await readPocketBalances({
  accessToken: 'balance-read-token',
  fetcher: async (url, init) => {
    pocketBalancesRequest = { url, init }
    return { ok: true, json: async () => balancesEnvelope }
  },
})
assert.deepEqual(pocketBalanceResult, { total: balancesEnvelope.total, rows: balancesEnvelope.rows })
assert.equal(pocketBalancesRequest.url, '/api/pocket/balances')
assert.equal(pocketBalancesRequest.init.method, 'GET')
assert.equal(pocketBalancesRequest.init.headers.authorization, 'Bearer balance-read-token')
assert.equal(pocketBalancesRequest.init.body, undefined)
const linkedWalletReadCalls = []
const linkedWallets = await readPocketLinkedWallets({
  accessToken: 'wallet-hydration-token',
  reader: async ({ accessToken }) => {
    linkedWalletReadCalls.push({ accessToken })
    return { wallets: {
      base: {
        network: 'base',
        wallet: { id: 'base-wallet-id', address: 'base-wallet-address', blockchain: 'ETH' },
        updatedAt: 1_720_000_000_000,
      },
      solana: {
        network: 'solana',
        wallet: { id: 'solana-wallet-id', address: 'solana-wallet-address', blockchain: 'SOL' },
        updatedAt: 1_720_000_000_000,
      },
    } }
  },
})
assert.deepEqual(linkedWalletReadCalls, [{ accessToken: 'wallet-hydration-token' }])
assert.deepEqual(linkedWallets, {
  base: { address: 'base-wallet-address', walletId: 'base-wallet-id', blockchain: 'ETH', updatedAt: 1_720_000_000_000 },
  solana: { address: 'solana-wallet-address', walletId: 'solana-wallet-id', blockchain: 'SOL', updatedAt: 1_720_000_000_000 },
})
let recipientSolanaRequest
const recipientSolanaBalance = await readPocketRecipientBalance({
  network: 'solana',
  address: 'recipient-solana-address',
  fetcher: async (url, init) => {
    recipientSolanaRequest = { url, init }
    return { ok: true, json: async () => ({ ok: true, network: 'solana', balance: '2500000' }) }
  },
})
assert.equal(recipientSolanaBalance, 2.5)
assert.equal(recipientSolanaRequest.url, '/api/pocket/balances/recipient')
assert.deepEqual(JSON.parse(recipientSolanaRequest.init.body), { network: 'solana', address: 'recipient-solana-address' })
let recipientEvmRequest
const recipientEvmBalance = await readPocketRecipientBalance({
  network: 'base',
  address: '0xrecipient',
  evmReader: async input => {
    recipientEvmRequest = input
    return 4_500_000n
  },
})
assert.equal(recipientEvmBalance, 4.5)
assert.deepEqual(recipientEvmRequest, { network: 'base', address: '0xrecipient' })

const pocketPosPanelsSource = await readFile(new URL('../src/pocket/features/move/PocketPosPanels.tsx', import.meta.url), 'utf8')
assert.match(pocketPosPanelsSource, /One QR for every sale/)
assert.match(pocketPosPanelsSource, /Create Naira POS QR/)
assert.match(pocketPosPanelsSource, /POS QR ready/)
assert.doesNotMatch(pocketPosPanelsSource, /fetch\(|\/api\/ng-pos|idempotency/i)
const localCurrencyProfileSource = await readFile(new URL('../src/pocket/components/LocalCurrencyProfileCard.tsx', import.meta.url), 'utf8')
assert.match(localCurrencyProfileSource, /Your payout profile/)
assert.match(localCurrencyProfileSource, /Sign in to continue/)
assert.doesNotMatch(localCurrencyProfileSource, /fetch\(|\/api\//i)
const pocketReceiveMethodSource = await readFile(new URL('../src/pocket/features/move/PocketReceiveMethodPanel.tsx', import.meta.url), 'utf8')
assert.match(pocketReceiveMethodSource, /Receive with email/)
assert.match(pocketReceiveMethodSource, /Circle Pocket receiving for Solana is not enabled here yet\./)
assert.doesNotMatch(pocketReceiveMethodSource, /fetch\(|\/api\/|idempotency/i)
const pocketPayerNetworkSource = await readFile(new URL('../src/pocket/features/move/PocketPayerNetworkPanel.tsx', import.meta.url), 'utf8')
assert.match(pocketPayerNetworkSource, /Let payer choose network/)
assert.match(pocketPayerNetworkSource, /Add receiving addresses/)
assert.doesNotMatch(pocketPayerNetworkSource, /fetch\(|\/api\/|idempotency/i)
const pocketPayLinkReadySource = await readFile(new URL('../src/pocket/features/move/PocketPayLinkReadyPanel.tsx', import.meta.url), 'utf8')
assert.match(pocketPayLinkReadySource, /Link Ready/)
assert.match(pocketPayLinkReadySource, /View payments/)
assert.match(pocketPayLinkReadySource, /Each payer enters their name/)
assert.doesNotMatch(pocketPayLinkReadySource, /fetch\(|\/api\/|idempotency|navigator\.share|buildDashboardLink/i)
const pocketReadClientSource = await readFile(new URL('../src/pocket/api/pocketReadClient.ts', import.meta.url), 'utf8')
assert.match(pocketReadClientSource, /POCKET_API\.profile/)
assert.match(pocketReadClientSource, /POCKET_API\.balances/)
assert.match(pocketReadClientSource, /POCKET_API\.activity/)
assert.doesNotMatch(pocketReadClientSource, /\/api\/local-currency-profile/)
assert.doesNotMatch(pocketReadClientSource, /\/api\/ng-pos|action: 'listHistory'/)
assert.match(pocketReadClientSource, /POCKET_BALANCE_NETWORKS.*base.*arbitrum.*arc.*solana/)
assert.match(pocketReadClientSource, /reader = readPocketWallets/)
assert.doesNotMatch(pocketReadClientSource, /resolvePrivyCircleLink/)
assert.doesNotMatch(pocketReadClientSource, /balanceReader = queryBalances/)
assert.match(pocketReadClientSource, /POCKET_API\.recipientBalance/)
assert.doesNotMatch(pocketReadClientSource, /\/api\/solana-balance|accountAddress/)
assert.match(pocketReadClientSource, /functionName: 'balanceOf'/)
assert.doesNotMatch(pocketReadClientSource, /savePrivyCircleLink|unlinkPrivyCircleLink|verifyAccount|createMerchant|createBankReceive|transfer|submit/i)
const pocketPayLinkBuilderSource = await readFile(new URL('../src/pocket/lib/pocketPayLinkBuilder.ts', import.meta.url), 'utf8')
assert.match(pocketPayLinkBuilderSource, /new URLSearchParams\(\{ x: '1' \}\)/)
assert.match(pocketPayLinkBuilderSource, /new URLSearchParams\(\{ n: network \}\)/)
assert.match(pocketPayLinkBuilderSource, /params\.set\('v', '1'\)/)
assert.match(pocketPayLinkBuilderSource, /params\.set\('xs', 'custom'\)/)
assert.doesNotMatch(pocketPayLinkBuilderSource, /fetch\(|axios|XMLHttpRequest|localStorage|sessionStorage|window\.|document\.|['"]\/api\//i)
const pocketWalletLinkClientSource = await readFile(new URL('../src/pocket/api/pocketWalletLinkClient.ts', import.meta.url), 'utf8')
assert.match(pocketWalletLinkClientSource, /POCKET_API\.walletLink/)
assert.match(pocketWalletLinkClientSource, /POCKET_API\.wallets/)
assert.match(pocketWalletLinkClientSource, /createPocketIdempotencyKey\('wallet-link'\)/)
assert.match(pocketWalletLinkClientSource, /createPocketIdempotencyKey\('wallet-unlink'\)/)
const pocketPosClientSource = await readFile(new URL('../src/pocket/api/pocketPosClient.ts', import.meta.url), 'utf8')
assert.match(pocketPosClientSource, /POCKET_API\.pos/)
assert.doesNotMatch(pocketPosClientSource, /\/api\/ng-pos|createMerchant|owner_id/)
const createLinkSource = await readFile(new URL('../src/pages/CreateLink.tsx', import.meta.url), 'utf8')
assert.match(createLinkSource, /usePocketIdentity\(\)/)
assert.match(createLinkSource, /usePocketProfile\(\{ authenticated: privyAuthenticated, email: privyEmail, getAccessToken \}\)/)
assert.doesNotMatch(createLinkSource, /initialPocketRoute|pocketBasePath|startsInStandalonePocket|startsInPocketUsdc|navigatePocket/)
assert.match(createLinkSource, /const POCKET_ENTRY_PATH = '\/pocket'/)
assert.match(createLinkSource, /function openStandaloneCirclePocket\(replace = false\)/)
assert.match(createLinkSource, /if \(product === 'circle-pocket'\) \{\s*openStandaloneCirclePocket\(true\)/)
assert.match(createLinkSource, /title: 'Circle Pocket Wallet'.*action: openStandaloneCirclePocket/)
assert.doesNotMatch(createLinkSource, /openCirclePocketMode|pushProductHistory\('circle-pocket'\)|agent-hash-mode/)
assert.doesNotMatch(createLinkSource, /usePrivy\(\)|readPocketLinkedWallets|readPocketBalances|readPocketActivity|readPocketLocalCurrencyProfile|savePocketLocalCurrencyProfile|readPocketRecipientBalance/)
assert.match(createLinkSource, /usePocketRecipient\(\{/)
assert.match(createLinkSource, /invalidateResult: invalidateRecipientResult/)
assert.doesNotMatch(createLinkSource, /circlePocketMode|circlePocketShellActive|PocketBottomNav|usePocketWallets|usePocketActivity|usePocketWalletController|usePocketWithdrawalController|PocketHomeOverview|PocketActivityPanel|restoreEmbeddedCirclePocketMode/)
assert.doesNotMatch(createLinkSource, /\blinkPocketWallet\b|\bconnectCircleEvmEmailWallet\b|\bconnectCircleSolanaEmailWallet\b/)
assert.match(createLinkSource, /createPocketPos\(\{/)
assert.match(createLinkSource, /createPocketBankReceive\(\{/)
assert.match(createLinkSource, /createPocketBankSend\(\{/)
assert.doesNotMatch(createLinkSource, /action:\s*'createMerchant'/)
assert.doesNotMatch(createLinkSource, /action:\s*'createBankReceive'/)
assert.doesNotMatch(createLinkSource, /action:\s*'createBankSend'/)
assert.doesNotMatch(createLinkSource, /action:\s*'institutions'|action:\s*'verifyAccount'/)
assert.doesNotMatch(createLinkSource, /preparePocketSolanaTransfer\(\{|submitPocketSolanaTransfer\(\{|executePocketEvmTransfer\(\{|signCircleSolanaTransaction\(\{/)
assert.doesNotMatch(createLinkSource, /fetch\(['"]\/api\/solana-(?:build-tx|relay)/)
assert.doesNotMatch(createLinkSource, /sendCircleEvmEmailWithdraw\(\{/)
const pocketIdentityHookSource = await readFile(new URL('../src/pocket/hooks/usePocketIdentity.ts', import.meta.url), 'utf8')
assert.match(pocketIdentityHookSource, /usePrivy\(\)/)
assert.match(pocketIdentityHookSource, /trim\(\)\.toLowerCase\(\)/)
assert.doesNotMatch(pocketIdentityHookSource, /fetch\(|\/api\//)
const pocketWalletsHookSource = await readFile(new URL('../src/pocket/hooks/usePocketWallets.ts', import.meta.url), 'utf8')
assert.match(pocketWalletsHookSource, /readPocketLinkedWallets\(\{ accessToken: token \}\)/)
assert.match(pocketWalletsHookSource, /readPocketBalances\(\{ accessToken: token \}\)/)
assert.match(pocketWalletsHookSource, /if \(!authenticated \|\| !email\)/)
assert.match(pocketWalletsHookSource, /POCKET_BALANCE_REFRESH_INTERVAL_MS = 45_000/)
assert.match(pocketWalletsHookSource, /window\.addEventListener\('focus', refreshVisibleBalance\)/)
assert.match(pocketWalletsHookSource, /document\.addEventListener\('visibilitychange', refreshVisibleBalance\)/)
assert.match(pocketWalletsHookSource, /if \(balanceReadInFlight\.current\) return/)
assert.doesNotMatch(pocketWalletsHookSource, /linkPocketWallet|unlinkPocketWallet|connectCircle|signCircle|executePocket|preparePocket|submitPocket/)
const pocketFxHookSource = await readFile(new URL('../src/pocket/hooks/usePocketFxQuote.ts', import.meta.url), 'utf8')
assert.match(pocketFxHookSource, /POCKET_FX_REFRESH_INTERVAL_MS = 30_000/)
assert.match(pocketFxHookSource, /window\.addEventListener\('focus', refreshVisibleQuote\)/)
assert.match(pocketFxHookSource, /document\.addEventListener\('visibilitychange', refreshVisibleQuote\)/)
assert.match(pocketFxHookSource, /quote\.expiresAt - Date\.now\(\)/)
const pocketFxEndpointSource = await readFile(new URL('../api/pocket/fx-quote.ts', import.meta.url), 'utf8')
assert.match(pocketFxEndpointSource, /PAYCREST_QUOTE_CACHE_MS = 30_000/)
assert.match(pocketFxEndpointSource, /\/v2\/rates\/base\/USDC\/\$\{encodeURIComponent\(amount\)\}\/NGN\?side=sell/)
assert.match(pocketFxEndpointSource, /Cache-Control', 'no-store'/)
assert.doesNotMatch(pocketFxEndpointSource, /fixer|configured|stale/i)
const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /app\.all\('\/api\/pocket\/fx-quote',\s+readLimiter, pocketFxQuoteHandler\)/)
const pocketActivityHookSource = await readFile(new URL('../src/pocket/hooks/usePocketActivity.ts', import.meta.url), 'utf8')
assert.match(pocketActivityHookSource, /readPocketActivity\(\{ accessToken: token \}\)/)
assert.match(pocketActivityHookSource, /data\.payments\.slice\(\)\.sort/)
assert.match(pocketActivityHookSource, /pocketActivityCache\.set\(email, nextRows\)/)
assert.doesNotMatch(pocketActivityHookSource, /catch \(reason\) \{\s*setRows\(\[\]\)/)
assert.doesNotMatch(pocketActivityHookSource, /\/api\/ng-pos|fetch\(|create|submit|transfer/i)
const pocketProfileHookSource = await readFile(new URL('../src/pocket/hooks/usePocketProfile.ts', import.meta.url), 'utf8')
assert.match(pocketProfileHookSource, /readPocketLocalCurrencyProfile\(\{ accessToken: token \}\)/)
assert.match(pocketProfileHookSource, /savePocketLocalCurrencyProfile\(\{/)
assert.match(pocketProfileHookSource, /expectedUpdatedAt: profile\?\.updatedAt/)
assert.match(pocketProfileHookSource, /profile: \{ \.\.\.draft, email: email \|\| draft\.email \}/)
assert.match(pocketProfileHookSource, /if \(!authenticated\) \{/)
assert.doesNotMatch(pocketProfileHookSource, /verifyPocket|createPocket|linkPocket|signCircle|executePocket|preparePocket|submitPocket|['"]\/api\//)
const pocketRecipientHookSource = await readFile(new URL('../src/pocket/hooks/usePocketRecipient.ts', import.meta.url), 'utf8')
assert.match(pocketRecipientHookSource, /ensureWallet\(network, \{ shouldContinue: \(\) => runKey\.current === currentRun \}\)/)
assert.match(pocketRecipientHookSource, /const existing = await readPocketWallet\(\{ accessToken, network \}\)/)
assert.match(pocketRecipientHookSource, /expectedUpdatedAt: existing\?\.updatedAt/)
assert.match(pocketRecipientHookSource, /readPocketRecipientBalance\(\{/)
assert.match(pocketRecipientHookSource, /hashpaylink-circle-email-receive-intent/)
assert.match(pocketRecipientHookSource, /Payment request cancelled\./)
assert.doesNotMatch(pocketRecipientHookSource, /fetch\(|['"]\/api\/|signCircle|executePocket|preparePocket|submitPocket|createPocketPos|createPocketBank/i)
const pocketWalletControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketWalletController.ts', import.meta.url), 'utf8')
assert.match(pocketWalletControllerSource, /const existing = await dependencies\.readWallet\(\{ accessToken, network \}\)/)
assert.match(pocketWalletControllerSource, /if \(!shouldContinue\(\)\) return null/)
assert.match(pocketWalletControllerSource, /circleUserToken: session\.userToken/)
assert.match(pocketWalletControllerSource, /updatedAt: linked\.link\?\.updatedAt/)
assert.match(pocketWalletControllerSource, /evmSession\.wallet\.address\.toLowerCase\(\) === walletAddress\.toLowerCase\(\)/)
assert.match(pocketWalletControllerSource, /solanaSession\?\.wallet\.address === walletAddress/)
assert.doesNotMatch(pocketWalletControllerSource, /signCircle|executePocketEvmTransfer|preparePocketSolanaTransfer|submitPocketSolanaTransfer|['"]\/api\//)
const pocketWithdrawalControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketWithdrawalController.ts', import.meta.url), 'utf8')
assert.match(pocketWithdrawalControllerSource, /validatePocketWithdrawal\(\{ network, address, amount, balance \}\)/)
assert.match(pocketWithdrawalControllerSource, /preparePocketSolanaTransfer\(\{ accessToken, recipient, amount \}\)/)
assert.match(pocketWithdrawalControllerSource, /signCircleSolanaTransaction\(\{/)
assert.match(pocketWithdrawalControllerSource, /submitPocketSolanaTransfer\(\{/)
assert.match(pocketWithdrawalControllerSource, /executePocketEvmTransfer\(\{/)
assert.match(pocketWithdrawalControllerSource, /Hash PayLink Circle Pocket withdraw/)
assert.match(pocketWithdrawalControllerSource, /Confirming transfer…/)
assert.match(pocketWithdrawalControllerSource, /readPocketEvmTransferStatus\(\{/)
assert.match(pocketWithdrawalControllerSource, /setNotice\(confirmed \? 'Sent'/)
assert.doesNotMatch(pocketWithdrawalControllerSource, /fetch\(|['"]\/api\/|\/api\/solana-build-tx|\/api\/solana-relay/)
const layoutSource = await readFile(new URL('../src/Layout.tsx', import.meta.url), 'utf8')
assert.match(layoutSource, /resolvePocketRoute\(pathname\.slice\('\/pocket'\.length\) \|\| '\/'\)/)
assert.doesNotMatch(layoutSource, /embeddedCirclePocket|circlePocketSurface|hashpaylink-circle-pocket-(?:surface|wallet-view|wallet-select|move-select|bills-select|activity-select)/)
assert.doesNotMatch(layoutSource, /AgentHashMode|agentHashSurfaceMode|agentHashMode|showAgentHashWidget|agent-hash-mode|TelegramHelperPanel/)
assert.match(layoutSource, /onWalletChange=\{\(view\) => navigatePocketHeader\(\{ section: 'home'/)
assert.match(layoutSource, /onMoveChange=\{\(view\) => navigatePocketHeader\(\{ section: 'move'/)
assert.match(layoutSource, /onBillChange=\{\(view\) => navigatePocketHeader\(\{ section: 'bills'/)
assert.match(layoutSource, /onActivityChange=\{\(view\) => navigatePocketHeader\(\{ section: 'activity'/)
assert.match(layoutSource, /navigate\(`\/pocket\$\{pocketPathFor\(state\)\}`\)/)
assert.match(layoutSource, /<CPurseIcon size=\{32\}/)
assert.match(layoutSource, /aria-label=\{theme === 'dark' \? 'Switch to light mode' : 'Switch to dark mode'\}/)
assert.match(layoutSource, /<PocketAccountMenu \/>/)
const circlePocketAppSource = await readFile(new URL('../src/pocket/CirclePocketApp.tsx', import.meta.url), 'utf8')
const standalonePocketSources = await readPocketSourceTree(new URL('../src/pocket/', import.meta.url))
for (const { path, source } of standalonePocketSources) {
  assert.doesNotMatch(
    source,
    /CreateLink|TelegramHelperPanel|TelegramPaymentLinks|AgentWorkspace|openCirclePocketMode|circlePocketMode|circlePocketShellActive/,
    `${path} must remain independent from the legacy embedded Circle Pocket surface`,
  )
}
assert.match(circlePocketAppSource, /import PocketBillsPage from '.\/pages\/PocketBillsPage'/)
assert.match(circlePocketAppSource, /route\.section === 'bills'/)
assert.match(circlePocketAppSource, /<PocketBillsPage view=\{route\.view\} \/>/)
assert.match(circlePocketAppSource, /import PocketActivityPage from '.\/pages\/PocketActivityPage'/)
assert.match(circlePocketAppSource, /route\.section === 'activity'/)
assert.match(circlePocketAppSource, /<PocketActivityPage view=\{route\.view\} \/>/)
assert.match(circlePocketAppSource, /import PocketAssistantPage from '.\/pages\/PocketAssistantPage'/)
assert.match(circlePocketAppSource, /route\.section === 'assistant'/)
assert.match(circlePocketAppSource, /<PocketAssistantPage \/>/)
assert.match(circlePocketAppSource, /import PocketHomePage from '.\/pages\/PocketHomePage'/)
assert.match(circlePocketAppSource, /import PocketLandingPage from '.\/pages\/PocketLandingPage'/)
assert.match(circlePocketAppSource, /if \(landing\) return <PocketLandingPage \/>/)
assert.match(circlePocketAppSource, /route\.section === 'home' && route\.view === 'smart-wallet'/)
assert.match(circlePocketAppSource, /<PocketHomePage \/>/)
assert.match(circlePocketAppSource, /import PocketMoveUsdcPage from '.\/pages\/PocketMoveUsdcPage'/)
assert.match(circlePocketAppSource, /route\.section === 'move' && route\.view === 'usdc'/)
assert.match(circlePocketAppSource, /<PocketMoveUsdcPage \/>/)
assert.match(circlePocketAppSource, /import PocketMoveBankPage from '.\/pages\/PocketMoveBankPage'/)
assert.match(circlePocketAppSource, /route\.section === 'move' && route\.view === 'bank'/)
assert.match(circlePocketAppSource, /<PocketMoveBankPage \/>/)
assert.match(circlePocketAppSource, /import PocketMovePosPage from '.\/pages\/PocketMovePosPage'/)
assert.match(circlePocketAppSource, /route\.section === 'move' && route\.view === 'pos'/)
assert.match(circlePocketAppSource, /<PocketMovePosPage \/>/)
const pocketBillsPageSource = await readFile(new URL('../src/pocket/pages/PocketBillsPage.tsx', import.meta.url), 'utf8')
assert.match(pocketBillsPageSource, /usePocketIdentity\(\)/)
assert.match(pocketBillsPageSource, /usePocketProfile\(\{ authenticated, email, getAccessToken \}\)/)
assert.match(pocketBillsPageSource, /<PocketBillsPanel/)
assert.match(pocketBillsPageSource, /<LocalCurrencyProfileCard/)
assert.match(pocketBillsPageSource, /<PocketRouteShell active="bills"/)
assert.doesNotMatch(pocketBillsPageSource, /CreateLink|fetch\(|['"]\/api\/|signCircle|linkPocketWallet|executePocket|preparePocket|submitPocket|createPocket/i)
const pocketActivityPageSource = await readFile(new URL('../src/pocket/pages/PocketActivityPage.tsx', import.meta.url), 'utf8')
assert.match(pocketActivityPageSource, /usePocketIdentity\(\)/)
assert.match(pocketActivityPageSource, /usePocketActivity\(\{ authenticated, email, enabled: true, getAccessToken \}\)/)
assert.match(pocketActivityPageSource, /<PocketRouteShell active="activity"/)
assert.match(pocketActivityPageSource, /<PocketActivityPanel/)
assert.doesNotMatch(pocketActivityPageSource, /CreateLink|fetch\(|['"]\/api\/|signCircle|linkPocketWallet|executePocket|preparePocket|submitPocket|createPocket/i)
const pocketRouteShellSource = await readFile(new URL('../src/pocket/components/PocketRouteShell.tsx', import.meta.url), 'utf8')
assert.match(pocketRouteShellSource, /window\.innerHeight - viewportHeight > 140/)
assert.match(pocketRouteShellSource, /<PocketBottomNav active=\{active\} keyboardOpen=\{keyboardOpen\}/)
assert.match(pocketRouteShellSource, /onRefresh/)
assert.match(pocketRouteShellSource, /pullDistance < 68/)
assert.match(pocketRouteShellSource, /pb-\[calc\(7\.5rem\+env\(safe-area-inset-bottom\)\)\]/)
assert.match(pocketRouteShellSource, /paddingTop: contentTop/)
assert.doesNotMatch(pocketRouteShellSource, /CreateLink|fetch\(|['"]\/api\//i)
const pocketHomePageSource = await readFile(new URL('../src/pocket/pages/PocketHomePage.tsx', import.meta.url), 'utf8')
const circlePocketAppBootSource = await readFile(new URL('../src/pocket/CirclePocketApp.tsx', import.meta.url), 'utf8')
const pocketHomeControlsSource = await readFile(new URL('../src/pocket/features/home/PocketHomeControls.tsx', import.meta.url), 'utf8')
const pocketSlideActionSource = await readFile(new URL('../src/pocket/components/PocketSlideAction.tsx', import.meta.url), 'utf8')
const pocketBridgeControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketBridgeController.ts', import.meta.url), 'utf8')
const pocketBankWithdrawControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketBankWithdrawController.ts', import.meta.url), 'utf8')
const { formatPocketDisplayAmount, formatPocketDollarAmount } = await import('../src/pocket/lib/pocketMoney.ts')
assert.equal(formatPocketDisplayAmount(0.125223), '0.12')
assert.equal(formatPocketDisplayAmount(0.033928), '0.033')
assert.equal(formatPocketDisplayAmount(0.001789), '0.0017')
assert.equal(formatPocketDollarAmount(4.5), '4.50')
assert.match(pocketHomeControlsSource, />From<\/p>/)
assert.match(pocketHomeControlsSource, />Destination<\/p>/)
assert.match(pocketHomeControlsSource, /<PocketSelect[\s\S]*ariaLabel="Select bridge destination network"/)
assert.match(pocketHomeControlsSource, /disabled: bridgeStatus === 'quoting' && bridgeAmountReady \? 'Getting live quote' : 'Enter bridge amount'/)
assert.match(pocketHomeControlsSource, /idle: 'Slide to bridge'/)
assert.match(pocketHomeControlsSource, /export function PocketHomeTabBar/)
assert.match(pocketHomeControlsSource, /formatPocketDisplayAmount\(bridgeQuote\.fee\)/)
assert.doesNotMatch(pocketHomeControlsSource, /To your Pocket wallet/)
assert.match(pocketSlideActionSource, /status === 'pending' \|\| status === 'submitted'/)
assert.match(pocketBridgeControllerSource, /setNotice\(complete \? '' : 'Bridge submitted\./)
assert.match(pocketBridgeControllerSource, /navigator\.vibrate\(8\)/)
assert.match(pocketBankWithdrawControllerSource, /for \(let attempt = 0; !cancelled\.current; attempt \+= 1\)/)
assert.match(pocketBankWithdrawControllerSource, /attempt <= 40 \? 3_000 : 12_000/)
assert.match(pocketBankWithdrawControllerSource, /await wait\(1_800\)/)
assert.match(pocketBankWithdrawControllerSource, /if \(reconciliation\) await pollUntilSettled/)
assert.match(circlePocketAppBootSource, /prefetchPocketWalletSnapshot\(\{ email, getAccessToken \}\)/)
assert.match(circlePocketAppBootSource, /Promise\.allSettled\(\[fontsReady, pocketDataReady\]\)/)
assert.match(circlePocketAppBootSource, /if \(!ready \|\| !appReady\)/)
assert.match(pocketWalletsHookSource, /export async function prefetchPocketWalletSnapshot/)
assert.match(pocketHomePageSource, /usePocketIdentity\(\)/)
assert.match(pocketHomePageSource, /useState<PocketHomeTab>\('balance'\)/)
assert.doesNotMatch(pocketHomePageSource, /pocket:home:tab/)
assert.match(pocketHomePageSource, /usePocketWallets\(\{ authenticated, email, getAccessToken \}\)/)
assert.match(pocketHomePageSource, /usePocketWalletController\(\{/)
assert.match(pocketHomePageSource, /usePocketWithdrawalController\(\{/)
assert.match(pocketHomePageSource, /<PocketHomeOverview/)
assert.match(pocketHomePageSource, /usePocketFxQuote\(wallets\.total\)/)
assert.match(pocketHomePageSource, /Promise\.all\(\[wallets\.refreshBalances\(\), fx\.refresh\(\)\]\)/)
assert.match(pocketHomePageSource, /<PocketHomeControls/)
assert.match(pocketHomePageSource, /controls=\{authenticated \? <PocketHomeTabBar/)
assert.match(pocketHomePageSource, /showNetworks=\{!authenticated \|\| tab === 'balance'\}/)
assert.match(pocketHomePageSource, /<PocketRouteShell[\s\S]*active="home"/)
assert.match(pocketHomePageSource, /Circle wallet setup was cancelled\./)
assert.match(pocketHomePageSource, /usePocketActivity\(\{ authenticated, email, enabled: tab === 'activity', getAccessToken \}\)/)
assert.doesNotMatch(pocketHomePageSource, /Copied \$\{networkLabel\} funding address|wallet ready/)
assert.doesNotMatch(pocketHomePageSource, /LocalCurrencyProfileCard|profileSlot/)
assert.doesNotMatch(pocketHomePageSource, /CreateLink|fetch\(|['"]\/api\/|signCircleSolanaTransaction|preparePocketSolanaTransfer|submitPocketSolanaTransfer|executePocketEvmTransfer|linkPocketWallet/i)
const pocketHomeOverviewSource = await readFile(new URL('../src/pocket/features/home/PocketHomeOverview.tsx', import.meta.url), 'utf8')
for (const logo of ['base', 'arbitrum', 'arc', 'solana']) {
  assert.match(pocketHomeOverviewSource, new RegExp(`/brand/${logo}-logo\\.jpeg`))
}
assert.match(pocketHomeOverviewSource, /logoCanvas === 'dark'/)
assert.match(pocketHomeOverviewSource, /grayscale contrast-200 mix-blend-multiply dark:mix-blend-screen/)
assert.match(pocketHomeOverviewSource, /network\.key === 'arc'[\s\S]*Testnet/)
assert.doesNotMatch(pocketHomeOverviewSource, /RefreshCw|Refresh Circle Pocket balance|title="Refresh balances"/)
assert.match(pocketHomeOverviewSource, /POCKET_BALANCE_CURRENCIES.*'USDC'.*'NGN'/)
assert.match(pocketHomeOverviewSource, /Previous balance currency/)
assert.match(pocketHomeOverviewSource, /Next balance currency/)
assert.doesNotMatch(pocketHomeOverviewSource, /Paycrest rate/)
assert.match(pocketHomeOverviewSource, /formatPocketDisplayAmount/)
assert.doesNotMatch(pocketHomeOverviewSource, /formatPocketDollarAmount/)
assert.doesNotMatch(pocketHomeControlsSource, /formatPocketDollarAmount/)
assert.match(pocketHomeOverviewSource, /globalBalance \* fxQuote\.rate/)
assert.doesNotMatch(pocketHomeOverviewSource, /Wallet not opened|Sign in to open|\bready\b|openedWalletCount|wallets open/i)
const pocketLandingPageSource = await readFile(new URL('../src/pocket/pages/PocketLandingPage.tsx', import.meta.url), 'utf8')
assert.match(pocketLandingPageSource, /usePocketProfile\(\{ authenticated, email, getAccessToken \}\)/)
assert.match(pocketLandingPageSource, /profile\.loaded/)
assert.match(pocketLandingPageSource, /await profile\.save\(\)/)
assert.match(pocketLandingPageSource, /What is your first name\?/)
assert.match(pocketLandingPageSource, /And your last name\?/)
assert.match(pocketLandingPageSource, /Open my Pocket/)
const pocketAccountMenuSource = await readFile(new URL('../src/pocket/components/PocketAccountMenu.tsx', import.meta.url), 'utf8')
assert.match(pocketAccountMenuSource, /initialsFor\(fullName, email\)/)
assert.match(pocketAccountMenuSource, /avatarGradient\(`/)
assert.match(pocketAccountMenuSource, /View profile/)
assert.match(pocketAccountMenuSource, /Edit profile/)
assert.match(pocketAccountMenuSource, /Sign out/)
const pocketMoveUsdcPageSource = await readFile(new URL('../src/pocket/pages/PocketMoveUsdcPage.tsx', import.meta.url), 'utf8')
assert.match(pocketMoveUsdcPageSource, /usePocketUsdcDraftController\(selectedNet\)/)
assert.match(pocketMoveUsdcPageSource, /usePocketRecipient\(\{/)
assert.match(pocketMoveUsdcPageSource, /<PocketRouteShell active="move"/)
assert.match(pocketMoveUsdcPageSource, /<PocketPayLinkReadyPanel/)
assert.match(pocketMoveUsdcPageSource, /<PayLinkShareSheet/)
assert.match(pocketMoveUsdcPageSource, /Secure access creates your email-backed Circle wallet and keeps payment receipts connected\./)
assert.doesNotMatch(pocketMoveUsdcPageSource, /CreateLink|fetch\(|['"]\/api\/|createPocketBank|createPocketPos|signCircle|executePocket|preparePocket|submitPocket/i)
const pocketUsdcDraftControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketUsdcDraftController.ts', import.meta.url), 'utf8')
assert.match(pocketUsdcDraftControllerSource, /buildPocketPayLink\(\{/)
assert.match(pocketUsdcDraftControllerSource, /window\.setTimeout\(\(\) => setCopied\(false\), 2500\)/)
assert.match(pocketUsdcDraftControllerSource, /navigator\.share\(\{ title: 'Hash PayLink', text: shareText, url: generatedLink \}\)/)
assert.match(pocketUsdcDraftControllerSource, /payment-link.*-qr\.png/)
assert.doesNotMatch(pocketUsdcDraftControllerSource, /fetch\(|['"]\/api\/|localStorage|sessionStorage|createPocketBank|createPocketPos|signCircle|executePocket|preparePocket|submitPocket/i)
const pocketUsdcValidationSource = await readFile(new URL('../src/pocket/controllers/pocketUsdcDraftValidation.ts', import.meta.url), 'utf8')
assert.match(pocketUsdcValidationSource, /Enter at least one wallet address to continue/)
assert.match(pocketUsdcValidationSource, /flexibleAmount \|\| amountValid/)
assert.doesNotMatch(pocketUsdcValidationSource, /window\.|document\.|navigator\.|fetch\(|['"]\/api\//i)
const pocketMoveBankPageSource = await readFile(new URL('../src/pocket/pages/PocketMoveBankPage.tsx', import.meta.url), 'utf8')
assert.match(pocketMoveBankPageSource, /usePocketBankReceiveController\(\{/)
assert.match(pocketMoveBankPageSource, /usePocketProfile\(\{ authenticated, email, getAccessToken \}\)/)
assert.match(pocketMoveBankPageSource, /<PocketVerifiedBankFields/)
assert.match(pocketMoveBankPageSource, /<PocketRouteShell active="move"/)
assert.match(pocketMoveBankPageSource, /Payment Request/)
assert.match(pocketMoveBankPageSource, /Direct Bank Payout/)
assert.match(pocketMoveBankPageSource, /Withdrawal network/)
assert.match(pocketMoveBankPageSource, /Slide to confirm/)
assert.match(pocketMoveBankPageSource, /usePocketBankWithdrawController\(\{/)
assert.match(pocketMoveBankPageSource, /\{authenticated && <fieldset disabled=\{directLocked\}/)
assert.doesNotMatch(pocketMoveBankPageSource, /Sent to \{direct\.result/)
assert.match(pocketMoveBankPageSource, /<LocalCurrencyProfileCard[\s\S]*?embedded/)
assert.match(pocketMoveBankPageSource, /<PocketVerifiedBankFields[\s\S]*?embedded/)
assert.match(pocketMoveBankPageSource, /Bank receive supports Base USDC only for now\./)
assert.match(pocketMoveBankPageSource, /Secure access keeps bank payouts, settlement history, receipts, and support records connected\./)
assert.doesNotMatch(pocketMoveBankPageSource, /CreateLink|fetch\(|['"]\/api\/|createPocketBankReceive|verifyPocketBankAccount|readPocketBankInstitutions|createPocketPos|createPocketBankSend|signCircle|executePocket|preparePocket|submitPocket/i)
const pocketBankReceiveControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketBankReceiveController.ts', import.meta.url), 'utf8')
assert.match(pocketBankReceiveControllerSource, /readPocketBankInstitutions\(\)/)
assert.match(pocketBankReceiveControllerSource, /verifyPocketBankAccount\(\{/)
assert.match(pocketBankReceiveControllerSource, /createPocketBankReceive\(\{/)
assert.match(pocketBankReceiveControllerSource, /idempotencyKey\.current \|\| window\.crypto\.randomUUID\(\)/)
assert.match(pocketBankReceiveControllerSource, /owner_first_name: profile\?\.firstName \|\| profileDraft\.firstName/)
assert.match(pocketBankReceiveControllerSource, /amount: flexibleAmount \? '' : amount/)
assert.match(pocketBankReceiveControllerSource, /client_origin: window\.location\.origin/)
assert.match(pocketBankReceiveControllerSource, /Sign in again to verify this bank account\./)
assert.match(pocketBankReceiveControllerSource, /Sign in again to create bank receive links\./)
assert.doesNotMatch(pocketBankReceiveControllerSource, /['"]\/api\/|createPocketPos|createPocketBankSend|signCircle|executePocket|preparePocket|submitPocket/i)
const pocketMovePosPageSource = await readFile(new URL('../src/pocket/pages/PocketMovePosPage.tsx', import.meta.url), 'utf8')
assert.match(pocketMovePosPageSource, /usePocketPosPageController\(\{/)
assert.match(pocketMovePosPageSource, /stepParam === 'setup' \|\| stepParam === 'ready'/)
assert.match(pocketMovePosPageSource, /params\.set\('posStep', step\)/)
assert.match(pocketMovePosPageSource, /<PocketPosCountryPanel/)
assert.match(pocketMovePosPageSource, /<PocketPosSetupPanel/)
assert.match(pocketMovePosPageSource, /<PocketPosReadyPanel/)
assert.match(pocketMovePosPageSource, /networkOptions=\{\[\{ key: 'base', label: 'Base' \}\]\}/)
assert.match(pocketMovePosPageSource, /<PocketRouteShell active="move"/)
assert.doesNotMatch(pocketMovePosPageSource, /CreateLink|fetch\(|['"]\/api\/|createPocketPos|verifyPocketBankAccount|readPocketBankInstitutions|createPocketBank|signCircle|executePocket|preparePocket|submitPocket/i)
const pocketPosPageControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketPosPageController.ts', import.meta.url), 'utf8')
assert.match(pocketPosPageControllerSource, /readPocketBankInstitutions\(\)/)
assert.match(pocketPosPageControllerSource, /verifyPocketBankAccount\(\{/)
assert.match(pocketPosPageControllerSource, /createPocketPos\(\{/)
assert.match(pocketPosPageControllerSource, /creationIdempotencyKey\.current \|\| window\.crypto\.randomUUID\(\)/)
assert.match(pocketPosPageControllerSource, /payout_preference: 'INSTANT_FIAT'/)
assert.match(pocketPosPageControllerSource, /supported_networks: \['base'\]/)
assert.match(pocketPosPageControllerSource, /Sign in and save your payout profile before creating POS\./)
assert.match(pocketPosPageControllerSource, /Sign in to create POS and save local currency receipts\./)
assert.match(pocketPosPageControllerSource, /window\.setTimeout\(\(\) => setCopied\(false\), 1800\)/)
assert.doesNotMatch(pocketPosPageControllerSource, /['"]\/api\/|KEEP_CRYPTO|createPocketBankReceive|createPocketBankSend|signCircle|executePocket|preparePocket|submitPocket/i)
assert.match(circlePocketAppSource, /route\.section === 'home' && route\.view === 'x402'\) return <PocketX402Page \/>/)
const pocketX402PageSource = await readFile(new URL('../src/pocket/pages/PocketX402Page.tsx', import.meta.url), 'utf8')
assert.match(pocketX402PageSource, /<PocketRouteShell active="home"/)
assert.match(pocketX402PageSource, /Available for app payments/)
assert.match(pocketX402PageSource, /Payment network/)
assert.match(pocketX402PageSource, /Sign in to Pocket/)
assert.match(pocketX402PageSource, /Create App Pay wallet/)
assert.match(pocketX402PageSource, /Restoring App Pay/)
assert.match(pocketX402PageSource, /Verify latest code/)
assert.match(pocketX402PageSource, /Add App Pay funds/)
assert.match(pocketX402PageSource, /Set aside USDC from your Pocket wallet for pay-per-use services\./)
assert.match(pocketX402PageSource, /h-9 w-\[104px\][\s\S]*Fund/)
assert.match(pocketX402PageSource, /h-9 w-\[104px\][\s\S]*Add funds/)
assert.match(pocketX402PageSource, /activationPending \? <>[\s\S]*Updating/)
assert.doesNotMatch(pocketX402PageSource, /RefreshCw|Refresh App Pay balance|title="Refresh App Pay"/)
assert.doesNotMatch(pocketX402PageSource, /Sign in to x402|Activate x402|x402 service balance|Balance network|Circle wallet balance/)
assert.doesNotMatch(pocketX402PageSource, /hash-logo-transparent|Continue with Pocket wallet|Use existing Circle wallet/)
assert.doesNotMatch(pocketX402PageSource, /CreateLink|AgentWorkspace|TelegramPaymentLinks|LP Scout|pay-lp-scout|fetch\(|['"]\/api\/|agentSlug/i)
const pocketX402ControllerSource = await readFile(new URL('../src/pocket/controllers/usePocketX402Controller.ts', import.meta.url), 'utf8')
assert.match(pocketX402ControllerSource, /readPocketX402Snapshot\(\{ accessToken, network: params\.network \}\)/)
assert.match(pocketX402ControllerSource, /connectPocketX402Wallet\(\{/)
assert.match(pocketX402ControllerSource, /activatePocketX402Gateway\(\{ accessToken, network, amount, idempotencyKey: key \}\)/)
assert.match(pocketX402ControllerSource, /Finish this OTP login or resend OTP before changing network\./)
assert.match(pocketX402ControllerSource, /USDC is available for app payments\./)
assert.match(pocketX402ControllerSource, /Could not add App Pay funds\./)
assert.match(pocketX402ControllerSource, /snapshotReady/)
assert.match(pocketX402ControllerSource, /activationTargetBalance/)
assert.match(pocketX402ControllerSource, /refreshedGatewayBalance \+ 0\.0000005 >= targetBalance/)
assert.match(pocketX402ControllerSource, /setActivationSuccess\(''\)/)
assert.match(pocketX402ControllerSource, /await refresh\(\{ silent: true \}\)/)
assert.match(pocketX402ControllerSource, /Confirming the updated balance automatically\./)
assert.match(pocketX402ControllerSource, /APP_PAY_CONFIRMATION_POLL_MS = 5_000/)
assert.match(pocketX402ControllerSource, /APP_PAY_CONFIRMATION_TIMEOUT_MS = 90_000/)
assert.doesNotMatch(pocketX402ControllerSource, /fetch\(|['"]\/api\/|AgentWorkspace|LP Scout|pay-lp-scout|receipt|disconnect/i)
const pocketMarketplacePanelSource = await readFile(new URL('../src/pocket/components/PocketMarketplacePanel.tsx', import.meta.url), 'utf8')
assert.match(pocketMarketplacePanelSource, /autoLoadAttempted\.current/)
assert.match(pocketMarketplacePanelSource, /role="dialog"/)
assert.match(pocketMarketplacePanelSource, /<Check className="h-5 w-5 stroke-\[2\.5\]"/)
assert.match(pocketMarketplacePanelSource, /text-\[#0071E3\]/)
assert.match(pocketMarketplacePanelSource, /aria-pressed=\{selected\?\.resource === item\.resource\}/)
assert.doesNotMatch(pocketMarketplacePanelSource, /!snapshot && !loading/)
assert.match(pocketRouteShellSource, /querySelector<HTMLElement>\('\[data-hashpaylink-top-nav\]'\)/)
assert.match(pocketRouteShellSource, /new ResizeObserver\(updateHeaderHeight\)/)
assert.match(pocketRouteShellSource, /paddingTop: contentTop/)
assert.match(pocketRouteShellSource, /data-pocket-scroller/)
assert.match(pocketRouteShellSource, /scrollPaddingTop: contentTop/)
assert.match(pocketRouteShellSource, /pocket:scroll:/)
assert.doesNotMatch(pocketRouteShellSource, /pt-\[8\.5rem\]/)
assert.match(circlePocketAppSource, /if \(!ready\)/)
assert.match(circlePocketAppSource, /Restoring your Pocket/)
assert.match(pocketHomePageSource, /pocket:home:network/)
const circleEvmEmailWalletSource = await readFile(new URL('../src/lib/circleEvmEmailWallet.ts', import.meta.url), 'utf8')
const circleSolanaEmailWalletSource = await readFile(new URL('../src/lib/circleSolanaEmailWallet.ts', import.meta.url), 'utf8')
assert.match(circleEvmEmailWalletSource, /capturePocketViewport\(\)/)
assert.match(circleEvmEmailWalletSource, /pollChallengeTransactionId/)
assert.match(circleEvmEmailWalletSource, /action: 'getChallenge'/)
assert.match(circleEvmEmailWalletSource, /Bridge submitted and is being reconciled\. Do not retry this bridge\./)
assert.match(circleEvmEmailWalletSource, /Withdrawal submitted and is being reconciled\. Do not retry this payout\./)
assert.match(circleSolanaEmailWalletSource, /capturePocketViewport\(\)/)
const pocketMoveUsdcSource = await readFile(new URL('../src/pocket/pages/PocketMoveUsdcPage.tsx', import.meta.url), 'utf8')
assert.match(pocketMoveUsdcSource, /useState<ReceiveMode>\('idle'\)/)
assert.match(pocketMoveUsdcSource, /receiveFlowOpen/)
assert.match(pocketMoveUsdcSource, /manualEvmAddress/)
assert.match(pocketMoveUsdcSource, /collapseReceiveMethod/)
assert.match(pocketMoveUsdcSource, /showEmailDetails=\{false\}/)
assert.match(pocketMoveUsdcSource, />Payment request<\/p>/)
assert.match(pocketMoveUsdcSource, /\(receiveMode !== 'email' \|\| authenticated\)/)
assert.match(pocketMoveUsdcSource, /<PocketPayerNetworkPanel[\s\S]*?embedded/)
assert.match(pocketReceiveMethodSource, /Receive with address/)
assert.match(pocketReceiveMethodSource, /Receive with email/)
assert.match(pocketReceiveMethodSource, /export function PocketEmailWalletDetails/)
assert.match(pocketReceiveMethodSource, /receiveMode !== 'email'/)
assert.match(pocketReceiveMethodSource, /receiveMode !== 'paste'/)
assert.doesNotMatch(pocketPosPanelsSource, /top-\[68px\]/)
assert.doesNotMatch(pocketPosPanelsSource, /standalone\s*\?\s*'fixed/)
const pocketRecipientSource = await readFile(new URL('../src/pocket/hooks/usePocketRecipient.ts', import.meta.url), 'utf8')
assert.match(pocketRecipientSource, /finally \{\s*setReceiveMode\('idle'\)/)
const agentWalletSource = await readFile(new URL('../api/agent-wallet.ts', import.meta.url), 'utf8')
assert.match(agentWalletSource, /circle-marketplace-registry', 45_000, 8 \* 1024 \* 1024/)
const pocketTopSwitchSource = await readFile(new URL('../src/pocket/components/PocketTopSwitch.tsx', import.meta.url), 'utf8')
assert.match(pocketTopSwitchSource, /\{ key: 'x402', label: 'App Pay'/)
const pocketBankErrorsSource = await readFile(new URL('../src/pocket/controllers/pocketBankErrors.ts', import.meta.url), 'utf8')
assert.match(pocketBankErrorsSource, /Bank payouts are temporarily unavailable\. Please try again later\./)
assert.doesNotMatch(pocketBankErrorsSource, /window\.|document\.|navigator\.|fetch\(|['"]\/api\//i)
const pocketBankReceiveClientSource = await readFile(new URL('../src/pocket/api/pocketBankReceiveClient.ts', import.meta.url), 'utf8')
assert.match(pocketBankReceiveClientSource, /POCKET_API\.bankReceive/)
assert.doesNotMatch(pocketBankReceiveClientSource, /\/api\/ng-pos|createBankReceive|owner_id/)
const pocketBankClientSource = await readFile(new URL('../src/pocket/api/pocketBankClient.ts', import.meta.url), 'utf8')
assert.match(pocketBankClientSource, /POCKET_API\.bankInstitutions/)
assert.match(pocketBankClientSource, /POCKET_API\.bankVerify/)
assert.doesNotMatch(pocketBankClientSource, /\/api\/ng-pos|verifyAccount|action:/)
const pocketBankSendClientSource = await readFile(new URL('../src/pocket/api/pocketBankSendClient.ts', import.meta.url), 'utf8')
assert.match(pocketBankSendClientSource, /POCKET_API\.bankSend/)
assert.doesNotMatch(pocketBankSendClientSource, /\/api\/ng-pos|createBankSend|owner_id|allowServiceRequest/)
const pocketBankSendHandlerSource = await readFile(new URL('../api/pocket/bank-send.ts', import.meta.url), 'utf8')
assert.doesNotMatch(pocketBankSendHandlerSource, /allowServiceRequest|polydesk-service|HASH_PAYLINK_POLYDESK_SERVICE_TOKEN/)
const ngPosSource = await readFile(new URL('../api/ng-pos.ts', import.meta.url), 'utf8')
assert.match(ngPosSource, /createNgPosBankSend\(req, body, \{ allowServiceRequest: true \}\)/)
const pocketSolanaTransferClientSource = await readFile(new URL('../src/pocket/api/pocketSolanaTransferClient.ts', import.meta.url), 'utf8')
assert.match(pocketSolanaTransferClientSource, /POCKET_API\.transferPrepare/)
assert.match(pocketSolanaTransferClientSource, /POCKET_API\.transferSubmit/)
assert.doesNotMatch(pocketSolanaTransferClientSource, /\/api\/solana-build-tx|\/api\/solana-relay|\bfrom\s*:|mode:\s*'withdraw'/)
const pocketEvmTransferClientSource = await readFile(new URL('../src/pocket/api/pocketEvmTransferClient.ts', import.meta.url), 'utf8')
assert.match(pocketEvmTransferClientSource, /sendCircleEvmEmailWithdraw/)
assert.match(pocketEvmTransferClientSource, /session\.wallet\.address\.toLowerCase\(\) !== linkedWalletAddress\.toLowerCase\(\)/)
assert.doesNotMatch(pocketEvmTransferClientSource, /fetch\(|\/api\/pocket\/transfers|authorization:/)
assert.doesNotMatch(createLinkSource, /linkPocketWallet\(\{|unlinkPocketWallet\(\{|readPocketWallet\(\{/)
const paymentPageSource = await readFile(new URL('../src/pages/PaymentPage.tsx', import.meta.url), 'utf8')
assert.match(paymentPageSource, /linkPocketWallet\(\{/)
assert.doesNotMatch(paymentPageSource, /savePrivyCircleLink|unlinkPrivyCircleLink|resolvePrivyCircleLink/)
assert.match(paymentPageSource, /if \(isWalletManagerFundingLink\) return walletManagerFundingChain/)
assert.doesNotMatch(paymentPageSource, /if \(isWalletManagerFundingLink\) return 'arc'/)
assert.match(paymentPageSource, /const fundingProofConfirmed = receiptConfirmed \|\| fundingTransferLogConfirmed \|\| directStatus === 'success'/)
assert.match(paymentPageSource, /const isConfirmed = isAgentOrWalletFunding \? fundingProofConfirmed : paymentConfirmed/)
assert.match(paymentPageSource, /if \(isAgentOrWalletFunding && !txH\)/)
assert.match(paymentPageSource, /paymentVerificationStartBlockRef\.current = latestBlock \+ 1n/)
assert.match(paymentPageSource, /setCircleEvmAcceptedPending\(true\)[\s\S]*?setManualPayDetected\(false\)/)
assert.match(paymentPageSource, />Confirming<\/p>/)
assert.match(paymentPageSource, />Funded<\/h2>/)
assert.match(paymentPageSource, /Redirecting back in 6 seconds/)
assert.match(paymentPageSource, /Funds detected\. Verifying transaction/)
assert.match(paymentPageSource, /circleEvmAcceptedPending \|\|[\s\S]*?Boolean\(txHash\) \|\|[\s\S]*?manualPayDetected/)
assert.doesNotMatch(paymentPageSource, /walletFundingConfirming[\s\S]{0,300}circleEvmPaymentProcessing/)
assert.match(agentWalletSource, /normalizeGatewayBalanceChain\(undefined\)/)
assert.match(agentWalletSource, /readGatewayBalance\(record\.walletAddress, gatewayBalanceChain, serviceKey\)/)
const paymentTxLookupSource = await readFile(new URL('../api/payment-tx-lookup.ts', import.meta.url), 'utf8')
assert.match(paymentTxLookupSource, /const requestedFromBlock = readOptionalBlock\(body\.fromBlock\)/)
assert.match(paymentTxLookupSource, /eth_getTransactionReceipt/)
assert.match(paymentTxLookupSource, /receipt\.status !== '0x1'/)
assert.doesNotMatch(paymentPageSource, /Arc x402 Funding|Funding Arc Testnet x402|Return to PolyDesk to activate x402/)
assert.match(pocketX402ControllerSource, /silent = false/)
assert.match(pocketX402ControllerSource, /setInterval\(refreshInBackground, 30_000\)/)
assert.match(pocketX402ControllerSource, /refresh\(\{ silent: true \}\)/)
const telegramPaymentLinksSource = await readFile(new URL('../src/pages/TelegramPaymentLinks.tsx', import.meta.url), 'utf8')
assert.match(telegramPaymentLinksSource, /readPocketWallet\(\{/)
assert.doesNotMatch(telegramPaymentLinksSource, /resolvePrivyCircleLink/)
assert.match(telegramPaymentLinksSource, /actionLink: \{ label: 'Open Circle Pocket', url: '\/pocket\/home\/smart-wallet' \}/)
assert.doesNotMatch(telegramPaymentLinksSource, /actionLink: \{ label: 'Open Circle Pocket', url: '\/\?product=circle-pocket' \}/)
const agentWorkspaceSource = await readFile(new URL('../src/pages/AgentWorkspace.tsx', import.meta.url), 'utf8')
assert.match(agentWorkspaceSource, /savePrivyCircleLink\(\{/)
assert.match(agentWorkspaceSource, /resolvePrivyCircleLink\(\{/)
assert.match(agentWorkspaceSource, /purpose:\s*'agent'/)
const pocketCommandContractsSource = await readFile(new URL('../src/pocket/commands/pocketCommandContracts.ts', import.meta.url), 'utf8')
assert.doesNotMatch(pocketCommandContractsSource, /fetch\(|axios|XMLHttpRequest|execute\s*[:=]/i)

console.log('circle pocket contracts smoke ok')
