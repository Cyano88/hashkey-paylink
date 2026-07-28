import { getAddress, isAddress, type Address } from 'viem'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CIRCLE_API_BASE = 'https://api.circle.com'
const verifiedOperatorWallets = new WeakSet<object>()

type CircleWalletResponse = {
  data?: {
    wallet?: {
      id?: unknown
      address?: unknown
      blockchain?: unknown
      custodyType?: unknown
      state?: unknown
      accountType?: unknown
    }
  }
}

export type ArcAgreementVerifiedOperatorWallet = Readonly<{
  verified: true
  walletId: string
  address: Address
  blockchain: 'ARC-TESTNET'
  custodyType: 'DEVELOPER'
  state: 'LIVE'
  accountType: 'EOA' | 'SCA'
}>

function requiredWalletId(value: unknown) {
  const walletId = String(value ?? '').trim()
  if (!UUID.test(walletId)) throw new Error('Circle operator wallet id is invalid.')
  return walletId
}

function requiredRequestId(value: unknown) {
  const requestId = String(value ?? '').trim()
  if (!UUID_V4.test(requestId)) throw new Error('Circle wallet preflight request id must be a UUID v4.')
  return requestId
}

function requiredOperator(value: unknown) {
  const operator = String(value ?? '').trim()
  if (!isAddress(operator) || /^0x0{40}$/i.test(operator)) throw new Error('Arc Agreement operator address is invalid.')
  return getAddress(operator)
}

export function verifyArcAgreementOperatorWallet(input: {
  walletId: unknown
  expectedOperator: unknown
  response: unknown
}): ArcAgreementVerifiedOperatorWallet {
  const walletId = requiredWalletId(input.walletId)
  const expectedOperator = requiredOperator(input.expectedOperator)
  const wallet = (input.response as CircleWalletResponse)?.data?.wallet
  if (!wallet || String(wallet.id ?? '').trim().toLowerCase() !== walletId.toLowerCase()) {
    throw new Error('Circle operator wallet response does not match the configured wallet id.')
  }
  if (wallet.blockchain !== 'ARC-TESTNET') throw new Error('Circle operator wallet must be on ARC-TESTNET.')
  if (wallet.custodyType !== 'DEVELOPER') throw new Error('Circle operator wallet must be developer-controlled.')
  if (wallet.state !== 'LIVE') throw new Error('Circle operator wallet must be live.')
  if (wallet.accountType !== 'EOA' && wallet.accountType !== 'SCA') {
    throw new Error('Circle operator wallet account type is unsupported.')
  }
  const address = String(wallet.address ?? '').trim()
  if (!isAddress(address) || getAddress(address) !== expectedOperator) {
    throw new Error('Circle operator wallet address does not match the immutable agreement operator.')
  }
  const proof: ArcAgreementVerifiedOperatorWallet = {
    verified: true,
    walletId,
    address: expectedOperator,
    blockchain: 'ARC-TESTNET',
    custodyType: 'DEVELOPER',
    state: 'LIVE',
    accountType: wallet.accountType,
  }
  verifiedOperatorWallets.add(proof)
  return Object.freeze(proof)
}

export function assertArcAgreementOperatorWalletProof(
  wallet: ArcAgreementVerifiedOperatorWallet,
  expectedOperator: unknown,
) {
  if (!wallet || !verifiedOperatorWallets.has(wallet)) {
    throw new Error('Circle operator wallet has not passed the ownership preflight.')
  }
  return verifyArcAgreementOperatorWallet({
    walletId: wallet?.walletId,
    expectedOperator,
    response: { data: { wallet: {
      id: wallet?.walletId,
      address: wallet?.address,
      blockchain: wallet?.blockchain,
      custodyType: wallet?.custodyType,
      state: wallet?.state,
      accountType: wallet?.accountType,
    } } },
  })
}

export async function fetchAndVerifyArcAgreementOperatorWallet(input: {
  apiKey: string
  walletId: string
  expectedOperator: string
  requestId: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}) {
  const apiKey = String(input.apiKey ?? '').trim()
  if (apiKey.length < 16) throw new Error('Circle API key is required for operator wallet preflight.')
  const walletId = requiredWalletId(input.walletId)
  const requestId = requiredRequestId(input.requestId)
  const timeoutMs = Number(input.timeoutMs ?? 10_000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error('Circle wallet preflight timeout is invalid.')
  }
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(`${CIRCLE_API_BASE}/v1/w3s/wallets/${encodeURIComponent(walletId)}`, {
    method: 'GET',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'x-request-id': requestId,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Circle operator wallet preflight authentication failed.')
    if (response.status === 404) throw new Error('Circle operator wallet was not found.')
    throw new Error(`Circle operator wallet preflight failed with HTTP ${response.status}.`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Circle operator wallet preflight returned invalid JSON.')
  }
  return verifyArcAgreementOperatorWallet({
    walletId,
    expectedOperator: input.expectedOperator,
    response: body,
  })
}
