import { missingPocketEvmWalletPlan } from './pocket/wallet-setup.js'
import { withOrdinaryWalletMutation } from './pocket/wallet-migration-guard.js'
import type { Request, Response } from 'express'
import { consumePocketPaymentApproval, requiresPocketPaymentApproval } from './pocket/payment-security.js'
import crypto from 'crypto'
import { inspectEvmReplacement, isEvmReplacementCandidate, replacementBatchRequest } from '../src/lib/circleEvmReplacement.js'
import { PublicKey } from '@solana/web3.js'
import { encodeFunctionData, isAddress, parseAbi } from 'viem'
import { CCTP_DOMAIN, CCTP_FORWARD_HOOK, CCTP_TOKEN_MESSENGER_V2, cctpForwardHookForSolana, cctpMintRecipient, readCctpForwardQuote, solanaRecipient, type PocketBridgeNetwork } from './pocket/cctp.js'
import {
  requireCircleGasStationEvmWallet,
  type CircleGasStationEvmChain,
} from './circle-evm-gas-station.js'
import { requireCircleSolanaGasStationWallet } from './circle-solana-gas-station.js'
import { circleLinkKey, readCircleLink, findPaymentCircleLinkByWallet, verifiedPrivyUser } from './privy-circle-link.js'

const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const PLATFORM_FEE_BPS = 20n
const BPS_DENOMINATOR = 10_000n

const EVM_CHAINS = {
  base: {
    blockchain: 'BASE',
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  arbitrum: {
    blockchain: 'ARB',
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  arc: {
    blockchain: 'ARC',
    tokenAddress: '0x3600000000000000000000000000000000000000',
  },
} as const

const ERC20_TRANSFER_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])
const ERC20_APPROVE_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)'])
const CCTP_TOKEN_MESSENGER_ABI = parseAbi(['function depositForBurnWithHook(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold,bytes hookData) returns (uint64 nonce)'])
const SMART_WALLET_BATCH_ABI = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const STREAM_FACTORY_ABI = parseAbi([
  'function createStream(address recipient,uint256 totalAmount,uint64 startTime,uint64 endTime,bytes32 salt) returns (address vault)',
])
const CHECKPOINT_FACTORY_ABI = parseAbi([
  'function createCheckpointVault(address recipient,bytes32 contentId,uint256 totalAmount,bytes32 salt) returns (address vault)',
])
const CHECKPOINT_VAULT_ABI = parseAbi(['function refund()'])
const ARENA_ESCROW_ABI = parseAbi(['function join()', 'function refund()'])

type CircleResponse<T = unknown> = {
  data?: T
  code?: number
  message?: string
  error?: string
}

function isTestnetBlockchain(blockchain: string | undefined) {
  return !!blockchain && blockchain.toUpperCase().includes('TESTNET')
}

function circleBaseUrl() {
  const raw = (process.env.CIRCLE_BASE_URL ?? 'https://api.circle.com').replace(/\/+$/, '')
  return raw.replace(/\/v1(?:\/w3s)?$/i, '')
}

function circleMainnetApiKey() {
  return process.env.CIRCLE_API_KEY
}

function circleTestnetApiKey() {
  return process.env.CIRCLE_TEST_API_KEY ?? process.env.CIRCLE_API_KEY_TEST
}

function solanaBlockchain() {
  return process.env.CIRCLE_SOLANA_BLOCKCHAIN ?? 'SOL'
}

function circleApiKey(input?: { chain?: string; blockchain?: string }) {
  const chain = input?.chain?.toLowerCase()
  const needsTestKey = isTestnetBlockchain(input?.blockchain)
  const mainnetKey = circleMainnetApiKey()
  const testnetKey = circleTestnetApiKey()
  if (needsTestKey) {
    if (testnetKey) return testnetKey
    if (mainnetKey?.startsWith('TEST_API')) return mainnetKey
    throw new Error('Arc Mainnet email wallet is not configured')
  }
  if (mainnetKey && !mainnetKey.startsWith('TEST_')) return mainnetKey
  throw new Error('CIRCLE_API_KEY not configured')
}

function circleHeaders(userToken?: string, apiKey = circleApiKey()) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Request-Id': crypto.randomUUID(),
    ...(userToken ? { 'X-User-Token': userToken } : {}),
  }
}

type CircleInit = {
  migrationInternal?: boolean
  signal?: AbortSignal
  method?: string
  body?: string
  userToken?: string
  apiKey?: string
  headers?: Record<string, string>
}

async function circleJson<T extends Record<string, unknown> = Record<string, unknown>>(path: string, init: CircleInit = {}) {
  const { apiKey, migrationInternal, ...requestInit } = init
  if(!migrationInternal && init.method==='POST' && /^\/v1\/w3s\/user\/(transactions|sign)/.test(path) && init.body) {
    const request=JSON.parse(init.body)
    if(typeof request.walletId==='string' && request.walletId)return withOrdinaryWalletMutation(request.walletId,()=>circleJson<T>(path,{...init,migrationInternal:true,signal:init.signal??AbortSignal.timeout(15_000)}))
  }
  const res = await fetch(`${circleBaseUrl()}${path}`, {
    ...requestInit,
    headers: {
      ...circleHeaders(init.userToken, apiKey),
      ...(init.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({})) as CircleResponse<T>
  if (!res.ok) {
    console.error('[circle-solana-email] Circle API failed', {
      path,
      status: res.status,
      code: body.code,
      message: body.message ?? body.error,
    })
    const err = new Error(body.message ?? body.error ?? `Circle request failed: ${res.status}`)
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).status = res.status
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).code = body.code
    ;(err as Error & { status?: number; code?: number; body?: CircleResponse }).body = body
    throw err
  }
  if (migrationInternal && (!init.method || init.method === 'GET')) {
    return { ...body.data, migrationPageLink: res.headers.get('link') } as T
  }
  return body.data as T
}

function circleError(res: Response, err: unknown) {
  const e = err as Error & { status?: number; code?: number; body?: CircleResponse }
  if (e.message === 'CIRCLE_API_KEY not configured' || e.message === 'Arc Mainnet email wallet is not configured') {
    return res.status(503).json({ ok: false, error: e.message })
  }
  const detail = (() => {
    try {
      return e.body ? JSON.stringify(e.body).slice(0, 400) : undefined
    } catch {
      return undefined
    }
  })()
  return res.status(e.status ?? 500).json({
    ok: false,
    code: e.code ?? e.body?.code,
    error: e.body?.message ?? e.body?.error ?? e.message ?? 'Circle request failed',
    detail,
  })
}

function isSolanaAddress(address: string) {
  try {
    const key = new PublicKey(address)
    return key.toBase58() === address
  } catch {
    return false
  }
}

function solanaWallet(wallets: Array<{ id: string; address: string; blockchain: string }>) {
  return wallets.find((wallet) =>
    (wallet.blockchain === solanaBlockchain() || wallet.blockchain === 'SOL') &&
    isSolanaAddress(wallet.address),
  )
}

function evmWallet(wallets: CircleUserWallet[], chain: keyof typeof EVM_CHAINS) {
  const expected = EVM_CHAINS[chain].blockchain
  const aliases: Record<keyof typeof EVM_CHAINS, string[]> = {
    base: ['BASE'],
    arbitrum: ['ARB', 'ARBITRUM', 'ARBITRUM-ONE', 'ARBITRUM_ONE', 'ARBITRUMONE'],
    arc: ['ARC'],
  }
  return wallets.find((wallet) => {
    if (isEvmReplacementCandidate(wallet)) return false
    const blockchain = String(wallet.blockchain ?? '').trim().toUpperCase()
    const accountType = String(wallet.accountType ?? '').trim().toUpperCase()
    const state = String(wallet.state ?? '').trim().toUpperCase()
    return (blockchain === expected || aliases[chain].includes(blockchain) || (chain === 'arbitrum' && blockchain.includes('ARB')))
      && accountType === 'SCA'
      && (!state || state === 'LIVE')
      && isAddress(wallet.address)
  })
}

export type CircleUserWallet = {
  refId?: string
  id: string
  address: string
  blockchain: string
  accountType?: string
  state?: string
  scaCore?: string
}

export async function listCircleUserWallets(userToken: string, chain: string): Promise<CircleUserWallet[]> {
  if (!userToken) throw new Error('Missing Circle user token')
  const data = await circleJson<{ wallets: CircleUserWallet[] }>('/v1/w3s/wallets?pageSize=50', {
    method: 'GET',
    userToken,
    apiKey: circleApiKey({ chain }),
    headers: { accept: 'application/json' },
  })
  return data.wallets ?? []
}

async function readCircleUserWallet(userToken: string, chain: string, walletId: string) {
  const data = await circleJson<{ wallet?: CircleUserWallet }>(
    `/v1/w3s/wallets/${encodeURIComponent(walletId)}`,
    {
      method: 'GET',
      userToken,
      apiKey: circleApiKey({ chain }),
      headers: { accept: 'application/json' },
    },
  )
  return data.wallet ?? null
}

export async function createCircleGasStationEvmChallenge(input: {
  userToken: string
  walletId: string
  walletAddress: string
  chain: CircleGasStationEvmChain
  callData: string
  refId: string
  idempotencyKey?: string
}) {
  const ownedWallet = await readCircleUserWallet(input.userToken, input.chain, input.walletId)
  const wallet = requireCircleGasStationEvmWallet({
    chain: input.chain,
    walletId: input.walletId,
    walletAddress: input.walletAddress,
    wallets: ownedWallet ? [ownedWallet] : [],
  })
  return circleJson<{
    challengeId?: string
    id?: string
    transactionId?: string
    transaction?: Record<string, unknown>
  }>('/v1/w3s/user/transactions/contractExecution', {
    method: 'POST',
    userToken: input.userToken,
    apiKey: circleApiKey({ chain: input.chain }),
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
      walletId: wallet.id,
      feeLevel: 'HIGH',
      refId: input.refId,
      contractAddress: wallet.address,
      callData: input.callData,
    }),
  })
}

export async function createCircleArcUserContractChallenge(input: {
  userToken: string
  walletId: string
  walletAddress: string
  callData: string
  idempotencyKey: string
  refId: string
}) {
  if (!input.userToken || input.userToken.length > 8_000) throw new Error('A valid Circle wallet session is required.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) {
    throw new Error('Circle challenge idempotency key must be a UUID v4.')
  }
  if (!input.walletId || input.walletId.length > 256 || !isAddress(input.walletAddress)) {
    throw new Error('A valid linked Circle Arc wallet is required.')
  }
  if (!/^0x[0-9a-f]+$/i.test(input.callData) || input.callData.length > 32_000) {
    throw new Error('Prepared Circle Arc call data is invalid.')
  }
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(input.refId)) throw new Error('Circle challenge reference is invalid.')
  return createCircleGasStationEvmChallenge({
    userToken: input.userToken,
    walletId: input.walletId,
    walletAddress: input.walletAddress,
    chain: 'arc',
    callData: input.callData,
    refId: input.refId,
    idempotencyKey: input.idempotencyKey,
  })
}

export async function readCircleArcUserChallenge(input: {
  userToken: string
  challengeId: string
}) {
  const userToken = String(input.userToken ?? '').trim()
  const challengeId = String(input.challengeId ?? '').trim()
  if (!userToken || userToken.length > 8_000) throw new Error('A valid Circle wallet session is required.')
  if (!challengeId || challengeId.length > 256 || !/^[a-zA-Z0-9_-]+$/.test(challengeId)) {
    throw new Error('Circle payer challenge id is invalid.')
  }
  const data = await circleJson<{ challenge?: Record<string, unknown> }>(
    `/v1/w3s/user/challenges/${encodeURIComponent(challengeId)}`,
    {
      method: 'GET',
      userToken,
      apiKey: circleApiKey({ chain: 'arc' }),
      headers: { accept: 'application/json' },
    },
  )
  return data.challenge ?? data
}

export async function readCircleArcUserTransaction(input: {
  userToken: string
  transactionId: string
}) {
  const userToken = String(input.userToken ?? '').trim()
  const transactionId = String(input.transactionId ?? '').trim()
  if (!userToken || userToken.length > 8_000) throw new Error('A valid Circle wallet session is required.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId)) {
    throw new Error('Circle payer transaction id is invalid.')
  }
  const data = await circleJson<{ transaction?: Record<string, unknown> }>(
    `/v1/w3s/transactions/${encodeURIComponent(transactionId)}`,
    {
      method: 'GET',
      userToken,
      apiKey: circleApiKey({ chain: 'arc' }),
      headers: { accept: 'application/json' },
    },
  )
  return data.transaction ?? data
}

function isBytes32(value: string | undefined): value is `0x${string}` {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const { action, ...params } = (req.body ?? {}) as Record<string, string>
  if (!action) return res.status(400).json({ ok: false, error: 'Missing action' })

  try {
    if (/^(execute|signPayment|signOwnWalletBridge)/.test(action)) {
      const walletId = String(params.walletId ?? '').trim()
      const walletAddress = String(params.walletAddress ?? params.fromAddress ?? '').trim()
      const link = await findPaymentCircleLinkByWallet(walletId, walletAddress)
      const declaredPocketClient = req.headers['x-pocket-client'] === '1'
      if (declaredPocketClient || link || action === 'executeEvmBridge' || action === 'signOwnWalletBridge') {
        if (!link) return res.status(403).json({ ok: false, error: 'Reconnect your Pocket wallet before paying.' })
        const identity = await verifiedPrivyUser(req)
        if (identity.userId !== link.privyUserId) return res.status(403).json({ ok: false, error: 'This Pocket wallet belongs to a different signed-in account.' })
        if (await requiresPocketPaymentApproval(identity.userId, action, declaredPocketClient)) {
          const approved = await consumePocketPaymentApproval(String(req.headers['x-pocket-payment-approval'] ?? ''), identity.userId)
          if (!approved) return res.status(401).json({ ok: false, error: 'Approve this payment with fingerprint, face, or your Pocket PIN.' })
        }
      }
    }
    if (action === 'requestEmailOtp') {
      const { deviceId, email, chain } = params
      if (!deviceId || !email) return res.status(400).json({ ok: false, error: 'Missing deviceId or email' })
      if (deviceId.length > 256 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: 'Enter a valid email address.' })
      }
      const data = await circleJson('/v1/w3s/users/email/token', {
        method: 'POST',
        apiKey: circleApiKey({ chain }),
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId, email }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'initializeUnifiedEvmUser') {
      const { userToken } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson('/v1/w3s/user/initialize', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ blockchain: 'BASE' }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: 'SCA',
          blockchains: ['BASE', 'ARB'],
          metadata: [
            { name: 'Pocket Base', refId: 'pocket:canonical-evm:v1' },
            { name: 'Pocket Arbitrum', refId: 'pocket:canonical-evm:v1' },
          ],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'refreshEmailSession') {
      const { userToken, refreshToken, deviceId, chain } = params
      if (!userToken || !refreshToken || !deviceId) {
        return res.status(400).json({ ok: false, error: 'Missing Circle wallet session credentials' })
      }
      if (userToken.length > 8_000 || refreshToken.length > 8_000 || deviceId.length > 256) {
        return res.status(400).json({ ok: false, error: 'Circle wallet session credentials are invalid' })
      }
      const data = await circleJson('/v1/w3s/users/token/refresh', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ chain }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          refreshToken,
          deviceId,
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'initializeUser') {
      const { userToken, blockchain, accountType } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson('/v1/w3s/user/initialize', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ blockchain }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: accountType || 'EOA',
          blockchains: [blockchain || solanaBlockchain()],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'createWallet') {
      const { userToken, blockchain, accountType, name, pocketSetupFor } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      let setupKey: string | undefined
      if (pocketSetupFor) {
        if (!['BASE', 'ARB'].includes(blockchain) || accountType !== 'SCA' || typeof pocketSetupFor !== 'string' || pocketSetupFor.length > 256) return res.status(400).json({ ok: false, error: 'Invalid wallet setup.' })
        const plan = missingPocketEvmWalletPlan(blockchain, pocketSetupFor, await listCircleUserWallets(userToken, 'base'))
        if (plan.walletReady) return res.json({ ok: true, walletReady: true })
        setupKey = plan.idempotencyKey
      }
      const data = await circleJson('/v1/w3s/user/wallets', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ blockchain }),
        body: JSON.stringify({
          idempotencyKey: setupKey || crypto.randomUUID(),
          accountType: accountType || 'EOA',
          blockchains: [blockchain || solanaBlockchain()],
          metadata: [{ name: name || 'Hash PayLink Solana' }],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'restoreActivatedEvmWallets') {
      res.setHeader('Cache-Control', 'no-store')
      if (!/^Bearer .+/i.test(String(req.headers.authorization ?? ''))) return res.status(401).json({ ok: false, error: 'Sign in to restore your Pocket wallets.' })
      const identity = await verifiedPrivyUser(req)
      const { userToken } = params
      if (!userToken || userToken.length > 8_000) return res.status(400).json({ ok: false, error: 'A valid Circle wallet session is required.' })
      const { readPocketWalletUpdate } = await import('./pocket/wallet-update-state.js')
      const { restoreActivatedMigrationWallets } = await import('./pocket/wallet-migration-session.js')
      const record = await readPocketWalletUpdate(identity.userId)
      const links = await Promise.all((['base', 'arbitrum', 'arc'] as const).map(network => readCircleLink(circleLinkKey(identity.userId, network, 'payment'))))
      const wallets = await restoreActivatedMigrationWallets({ userId: identity.userId, record, links, readOwnedWallet: (network, id) => readCircleUserWallet(userToken, network, id) })
      return res.json({ ok: true, wallets })
    }

    if (action === 'prepareEvmReplacement' || action === 'listEvmReplacement' || action === 'reviewEvmReplacement') {
      if (!/^Bearer .+/i.test(String(req.headers.authorization ?? ''))) return res.status(401).json({ ok: false, error: 'Sign in to prepare replacement wallets.' })
      const { userToken, attemptId, walletId, walletAddress } = params
      if (!userToken || !attemptId || !walletId || !walletAddress) return res.status(400).json({ ok: false, error: 'Missing replacement preparation details.' })
      let body: ReturnType<typeof replacementBatchRequest>
      try { body = replacementBatchRequest(attemptId) } catch { return res.status(400).json({ ok: false, error: 'Invalid replacement attempt ID.' }) }
      const identity = await verifiedPrivyUser(req)
      const link = await findPaymentCircleLinkByWallet(walletId, walletAddress)
      if (!link || link.privyUserId !== identity.userId || link.chain !== 'base') return res.status(403).json({ ok: false, error: 'Reconnect your current Pocket Base wallet first.' })
      const owned = await readCircleUserWallet(userToken, 'base', walletId)
      if (!owned || owned.state !== 'LIVE' || isEvmReplacementCandidate(owned) || owned.blockchain !== 'BASE' || owned.accountType !== 'SCA' || owned.address.toLowerCase() !== link.circleWalletAddress.toLowerCase()) return res.status(403).json({ ok: false, error: 'Circle could not verify the current wallet.' })
      if (action === 'listEvmReplacement' || action === 'reviewEvmReplacement') {
        const data = await circleJson<{ wallets: CircleUserWallet[] }>('/v1/w3s/wallets?pageSize=50&refId=' + encodeURIComponent(body.metadata[0].refId), {
          method: 'GET', userToken, apiKey: circleApiKey({ chain: 'base' }),
        })
        if (action === 'reviewEvmReplacement') {
          const candidates = inspectEvmReplacement((data.wallets ?? []) as import('../src/lib/circleEvmWalletTopology.js').CircleEvmWalletRecord[], attemptId)
          if (candidates.status !== 'matching') return res.status(409).json({ ok: false, error: 'Verify all three replacement wallets before reviewing balances.' })
          const { readFreshMigrationUsdcUnits } = await import('./evm-balance.js')
          const { buildMigrationPlan, saveMigrationPlan, migrationNetworks, existingMigrationReview } = await import('./pocket/wallet-migration-plan.js')
          const {readDurableJson}=await import('./render-durable-store.js')
          const saved=await readDurableJson<import('./pocket/wallet-migration-plan.js').MigrationPlan>('pocket:wallet-migration-plan:v1:'+identity.userId)
          const resumed=existingMigrationReview(saved,identity.userId,attemptId,Object.values(candidates.wallets))
          if(resumed)return res.json({ok:true,...resumed})
          const links = {} as Record<'base' | 'arbitrum' | 'arc', import('./privy-circle-link.js').CircleLinkRecord | null>
          const units = {} as Record<'base' | 'arbitrum' | 'arc', bigint>
          const rows = await Promise.all(migrationNetworks.map(async network => {
            const source = await readCircleLink(circleLinkKey(identity.userId, network, 'payment'))
            links[network] = source
            // A missing source is unknown, never evidence of an empty wallet.
            if (!source) return { network, balance: null, status: 'unavailable' }
            if (source.privyUserId !== identity.userId || source.chain !== network || (source.purpose ?? 'payment') !== 'payment') throw new Error('Wallet review ownership mismatch.')
            try {
              const exact = await readFreshMigrationUsdcUnits(network, source.circleWalletAddress as `0x${string}`)
              units[network] = exact
              return { network, balance: Number(exact) / 1_000_000, amountUnits: exact.toString(), status: 'ok' }
            } catch { return { network, balance: null, status: 'unavailable' } }
          }))
          if (rows.every(row => row.status === 'ok')) {
            await saveMigrationPlan(buildMigrationPlan({ userId: identity.userId, attemptId, wallets: Object.values(candidates.wallets), links, units }))
          }
          return res.json({ ok: true, phase: 'review', rows, transferAvailable: false })
        }
        return res.json({ ok: true, wallets: data.wallets ?? [] })
      }
      const data = await circleJson('/v1/w3s/user/wallets', {
        method: 'POST', userToken, apiKey: circleApiKey({ chain: 'base' }), body: JSON.stringify(body),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'createUnifiedEvmWallets') {
      const { userToken } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      const data = await circleJson('/v1/w3s/user/wallets', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ blockchain: 'BASE' }),
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: 'SCA',
          blockchains: ['BASE', 'ARB'],
          metadata: [
            { name: 'Pocket Base', refId: 'pocket:canonical-evm:v1' },
            { name: 'Pocket Arbitrum', refId: 'pocket:canonical-evm:v1' },
          ],
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'listWallets') {
      const { userToken, chain } = params
      if (!userToken) return res.status(400).json({ ok: false, error: 'Missing userToken' })
      // Older installed clients must not discover candidates through normal recovery.
      const wallets = (await listCircleUserWallets(userToken, chain)).filter(wallet => !isEvmReplacementCandidate(wallet))
      const wallet = chain === 'base' || chain === 'arbitrum' || chain === 'arc'
        ? evmWallet(wallets, chain)
        : solanaWallet(wallets)
      return res.json({ ok: true, wallets, wallet })
    }

    if (action === 'executeSolanaTransfer') {
      const { userToken, walletId, walletAddress, recipient, amount, idempotencyKey } = params
      if (!userToken || !walletId || !walletAddress || !recipient || !amount || !idempotencyKey) {
        return res.status(400).json({ ok: false, error: 'Missing transfer details or idempotency key.' })
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return res.status(400).json({ ok: false, error: 'Invalid transfer idempotency key.' })
      let destinationAddress: string
      try {
        destinationAddress = new PublicKey(recipient).toBase58()
      } catch {
        return res.status(400).json({ ok: false, error: 'Enter a valid Solana recipient address.' })
      }
      const ownedWallet = await readCircleUserWallet(userToken, 'solana', walletId)
      const wallet = requireCircleSolanaGasStationWallet({
        walletId,
        walletAddress,
        wallets: ownedWallet ? [ownedWallet] : [],
      })
      const transferAmount = normalizeSolanaUsdcAmount(amount)
      const data = await circleJson<{
        challengeId?: string
        id?: string
        transactionId?: string
        transaction?: Record<string, unknown>
      }>('/v1/w3s/user/transactions/transfer', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ chain: 'solana' }),
        body: JSON.stringify({
          idempotencyKey,
          walletId: wallet.id,
          destinationAddress,
          amounts: [transferAmount],
          feeLevel: 'HIGH',
          refId: 'hashpaylink-solana-withdraw',
          tokenAddress: SOLANA_USDC_MINT,
          blockchain: 'SOL',
        }),
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'executeEvmPayment') {
      const { userToken, walletId, walletAddress, chain, recipient, totalUnits, idempotencyKey } = params
      if (!userToken || !walletId || !walletAddress || !chain || !recipient || !totalUnits || !idempotencyKey) {
        return res.status(400).json({ ok: false, error: 'Missing EVM withdrawal details or idempotency key.' })
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return res.status(400).json({ ok: false, error: 'Invalid withdrawal idempotency key.' })
      if (chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') {
        return res.status(400).json({ ok: false, error: 'Unsupported EVM email wallet chain' })
      }
      if (!isAddress(walletAddress) || !isAddress(recipient)) {
        return res.status(400).json({ ok: false, error: 'Invalid EVM wallet or recipient address' })
      }

      const total = BigInt(totalUnits)
      const requestedFeeBps = String(params.feeBps ?? '') === '0'
        ? 0n
        : PLATFORM_FEE_BPS
      const fee = total * requestedFeeBps / BPS_DENOMINATOR
      const grossFees = params.feeMode === 'gross'
      const treasuryAmount = fee
      const recipientAmount = grossFees ? total : total - treasuryAmount
      if (total <= 0n || recipientAmount <= 0n) {
        return res.status(400).json({ ok: false, error: 'Invalid payment amount' })
      }

      const tokenAddress = EVM_CHAINS[chain].tokenAddress
      const recipientCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, recipientAmount],
      })
      const batchCalls = [
        { target: tokenAddress as `0x${string}`, value: 0n, data: recipientCallData },
      ]
      if (treasuryAmount > 0n) {
        const treasuryCallData = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [EVM_TREASURY as `0x${string}`, treasuryAmount],
        })
        batchCalls.push({ target: tokenAddress as `0x${string}`, value: 0n, data: treasuryCallData })
      }
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [batchCalls],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain,
        refId: `hashpaylink-${chain}`,
        callData: batchCallData,
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'executeEvmWithdraw') {
      const { userToken, walletId, walletAddress, chain, recipient, totalUnits, idempotencyKey } = params
      if (!userToken || !walletId || !walletAddress || !chain || !recipient || !totalUnits || !idempotencyKey) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, walletAddress, chain, recipient, totalUnits, or idempotencyKey' })
      }
      if (chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') {
        return res.status(400).json({ ok: false, error: 'Unsupported EVM withdraw chain' })
      }
      if (!isAddress(walletAddress) || !isAddress(recipient)) {
        return res.status(400).json({ ok: false, error: 'Invalid EVM wallet or recipient address' })
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
        return res.status(400).json({ ok: false, error: 'Invalid withdrawal idempotency key.' })
      }

      const total = BigInt(totalUnits)
      if (total <= 0n) {
        return res.status(400).json({ ok: false, error: 'Invalid withdraw amount' })
      }

      const tokenAddress = EVM_CHAINS[chain].tokenAddress
      const transferCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, total],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: transferCallData },
        ]],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain,
        refId: `hashpaylink-${chain}-withdraw`,
        callData: batchCallData,
        idempotencyKey,
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'executeEvmBridge') {
      const { userToken, walletId, walletAddress, chain, destination, destinationAddress, amountUnits, idempotencyKey } = params
      if (!userToken || !walletId || !walletAddress || !chain || !destination || !destinationAddress || !amountUnits) {
        return res.status(400).json({ ok: false, error: 'Missing bridge parameters' })
      }
      if (idempotencyKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return res.status(400).json({ ok: false, error: 'Invalid bridge idempotency key.' })
      if ((chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') || (destination !== 'base' && destination !== 'arbitrum' && destination !== 'arc' && destination !== 'solana') || chain === destination) {
        return res.status(400).json({ ok: false, error: 'Unsupported mainnet bridge route' })
      }
      if (!isAddress(walletAddress) || (destination !== 'solana' && !isAddress(destinationAddress))) {
        return res.status(400).json({ ok: false, error: 'Invalid bridge wallet address' })
      }
      const ownedWallets = await listCircleUserWallets(userToken, chain)
      if (!ownedWallets.some(wallet => wallet.address.toLowerCase() === destinationAddress.toLowerCase() && wallet.blockchain === (destination === 'solana' ? 'SOL' : EVM_CHAINS[destination as keyof typeof EVM_CHAINS].blockchain))) {
        return res.status(403).json({ ok: false, error: 'Bridge destination must be one of your Circle Pocket wallets' })
      }
      const transferUnits = BigInt(amountUnits)
      if (transferUnits <= 0n) return res.status(400).json({ ok: false, error: 'Invalid bridge amount' })
      const destinationNetwork = destination as PocketBridgeNetwork
      const solana = destinationNetwork === 'solana' ? await solanaRecipient(destinationAddress) : null
      const quote = await readCctpForwardQuote(chain, destinationNetwork, transferUnits, solana?.needsSetup)
      const mintRecipient = destinationNetwork === 'solana'
        ? `0x${Buffer.from(solana!.ata.toBytes()).toString('hex')}`
        : cctpMintRecipient(destinationNetwork, destinationAddress)
      const hookData = solana ? cctpForwardHookForSolana(solana.wallet, solana.needsSetup) : CCTP_FORWARD_HOOK
      const tokenAddress = EVM_CHAINS[chain].tokenAddress
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [CCTP_TOKEN_MESSENGER_V2, quote.totalUnits],
      })
      const burnData = encodeFunctionData({
        abi: CCTP_TOKEN_MESSENGER_ABI,
        functionName: 'depositForBurnWithHook',
        args: [
          quote.totalUnits,
          CCTP_DOMAIN[destinationNetwork],
          mintRecipient as `0x${string}`,
          tokenAddress,
          `0x${'0'.repeat(64)}`,
          quote.maxFeeUnits,
          quote.finalityThreshold,
          hookData as `0x${string}`,
        ],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: approveData },
          { target: CCTP_TOKEN_MESSENGER_V2 as `0x${string}`, value: 0n, data: burnData },
        ]],
      })
      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain,
        refId: `circle-pocket-${chain}-to-${destination}`,
        idempotencyKey,
        callData: batchCallData,
      })
      return res.json({ ok: true, ...data })
    }

    // Legacy vault calls require independently verified mainnet deployments.
    if (['executeArcStream', 'executeArcCheckpointVault', 'executeArcCheckpointRefund', 'executeArcArenaJoin', 'executeArcArenaRefund'].includes(action)) {
      return res.status(503).json({ ok: false, error: 'This Arc contract feature is awaiting its verified mainnet deployment.' })
    }
    if (action === 'executeArcStream') {
      const { userToken, walletId, walletAddress, factoryAddress, recipient, amountUnits, startTime, endTime, salt, predictedVault } = params
      if (!userToken || !walletId || !walletAddress || !factoryAddress || !recipient || !amountUnits || !startTime || !endTime || !salt || !predictedVault) {
        return res.status(400).json({ ok: false, error: 'Missing Arc stream parameters' })
      }
      if (!isAddress(walletAddress) || !isAddress(factoryAddress) || !isAddress(recipient) || !isAddress(predictedVault) || !isBytes32(salt)) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc stream address or salt' })
      }
      const totalAmount = BigInt(amountUnits)
      const start = BigInt(startTime)
      const end = BigInt(endTime)
      if (totalAmount <= 0n || end <= start) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc stream amount or duration' })
      }

      const tokenAddress = EVM_CHAINS.arc.tokenAddress
      const fundCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [predictedVault as `0x${string}`, totalAmount],
      })
      const createCallData = encodeFunctionData({
        abi: STREAM_FACTORY_ABI,
        functionName: 'createStream',
        args: [recipient as `0x${string}`, totalAmount, start, end, salt],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: fundCallData },
          { target: factoryAddress as `0x${string}`, value: 0n, data: createCallData },
        ]],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain: 'arc',
        refId: 'hashpaylink-arc-streampay',
        callData: batchCallData,
      })
      return res.json({ ok: true, vault: predictedVault, ...data })
    }

    if (action === 'executeArcCheckpointVault') {
      const { userToken, walletId, walletAddress, factoryAddress, recipient, amountUnits, contentId, salt, predictedVault } = params
      if (!userToken || !walletId || !walletAddress || !factoryAddress || !recipient || !amountUnits || !contentId || !salt || !predictedVault) {
        return res.status(400).json({ ok: false, error: 'Missing Arc checkpoint escrow parameters' })
      }
      if (!isAddress(walletAddress) || !isAddress(factoryAddress) || !isAddress(recipient) || !isAddress(predictedVault) || !isBytes32(contentId) || !isBytes32(salt)) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc checkpoint escrow address, content ID, or salt' })
      }
      const totalAmount = BigInt(amountUnits)
      if (totalAmount <= 0n) {
        return res.status(400).json({ ok: false, error: 'Invalid checkpoint escrow amount' })
      }

      const tokenAddress = EVM_CHAINS.arc.tokenAddress
      const fundCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [predictedVault as `0x${string}`, totalAmount],
      })
      const createCallData = encodeFunctionData({
        abi: CHECKPOINT_FACTORY_ABI,
        functionName: 'createCheckpointVault',
        args: [recipient as `0x${string}`, contentId as `0x${string}`, totalAmount, salt as `0x${string}`],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: factoryAddress as `0x${string}`, value: 0n, data: createCallData },
          { target: tokenAddress as `0x${string}`, value: 0n, data: fundCallData },
        ]],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain: 'arc',
        refId: 'hashpaystream-arc-checkpoint-escrow',
        callData: batchCallData,
      })
      return res.json({ ok: true, vault: predictedVault, ...data })
    }

    if (action === 'executeArcCheckpointRefund') {
      const { userToken, walletId, walletAddress, vaultAddress } = params
      if (!userToken || !walletId || !walletAddress || !vaultAddress) {
        return res.status(400).json({ ok: false, error: 'Missing Arc checkpoint refund parameters' })
      }
      if (!isAddress(walletAddress) || !isAddress(vaultAddress)) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc checkpoint wallet or vault address' })
      }

      const refundCallData = encodeFunctionData({
        abi: CHECKPOINT_VAULT_ABI,
        functionName: 'refund',
        args: [],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: vaultAddress as `0x${string}`, value: 0n, data: refundCallData },
        ]],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain: 'arc',
        refId: 'hashpaystream-arc-checkpoint-refund',
        callData: batchCallData,
      })
      return res.json({ ok: true, vaultAddress, ...data })
    }

    if (action === 'executeArcArenaJoin') {
      const { userToken, walletId, walletAddress, escrowAddress, entryUnits } = params
      if (!userToken || !walletId || !walletAddress || !escrowAddress || !entryUnits) {
        return res.status(400).json({ ok: false, error: 'Missing Arc Arena join parameters' })
      }
      if (!isAddress(walletAddress) || !isAddress(escrowAddress)) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc Arena wallet or escrow address' })
      }

      const entryAmount = BigInt(entryUnits)
      if (entryAmount <= 0n) {
        return res.status(400).json({ ok: false, error: 'Invalid Arena entry amount' })
      }

      const tokenAddress = EVM_CHAINS.arc.tokenAddress
      const fundCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [escrowAddress as `0x${string}`, entryAmount],
      })
      const joinCallData = encodeFunctionData({
        abi: ARENA_ESCROW_ABI,
        functionName: 'join',
        args: [],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: fundCallData },
          { target: escrowAddress as `0x${string}`, value: 0n, data: joinCallData },
        ]],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain: 'arc',
        refId: 'hashpaylink-arc-arena-join',
        callData: batchCallData,
      })
      return res.json({ ok: true, escrowAddress, ...data })
    }

    if (action === 'executeArcArenaRefund') {
      const { userToken, walletId, walletAddress, escrowAddress } = params
      if (!userToken || !walletId || !walletAddress || !escrowAddress) {
        return res.status(400).json({ ok: false, error: 'Missing Arc Arena refund parameters' })
      }
      if (!isAddress(walletAddress) || !isAddress(escrowAddress)) {
        return res.status(400).json({ ok: false, error: 'Invalid Arc Arena wallet or escrow address' })
      }

      const refundCallData = encodeFunctionData({
        abi: ARENA_ESCROW_ABI,
        functionName: 'refund',
        args: [],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: escrowAddress as `0x${string}`, value: 0n, data: refundCallData },
        ]],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain: 'arc',
        refId: 'hashpaylink-arc-arena-refund',
        callData: batchCallData,
      })
      return res.json({ ok: true, escrowAddress, ...data })
    }

    if (action === 'deployEvmWallet') {
      const { userToken, walletId, walletAddress, chain } = params
      if (!userToken || !walletId || !walletAddress || !chain) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, walletAddress, or chain' })
      }
      if (chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') {
        return res.status(400).json({ ok: false, error: 'Unsupported EVM email wallet chain' })
      }
      if (!isAddress(walletAddress)) {
        return res.status(400).json({ ok: false, error: 'Invalid EVM wallet address' })
      }

      const tokenAddress = EVM_CHAINS[chain].tokenAddress
      const selfTransferCallData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [walletAddress as `0x${string}`, 0n],
      })
      const batchCallData = encodeFunctionData({
        abi: SMART_WALLET_BATCH_ABI,
        functionName: 'executeBatch',
        args: [[
          { target: tokenAddress as `0x${string}`, value: 0n, data: selfTransferCallData },
        ]],
      })

      const data = await createCircleGasStationEvmChallenge({
        userToken,
        walletId,
        walletAddress,
        chain,
        refId: `hashpaylink-${chain}-wallet-activate`,
        callData: batchCallData,
      })
      return res.json({ ok: true, ...data })
    }

    if (action === 'getTransaction') {
      const { userToken, transactionId, chain } = params
      if (!userToken || !transactionId) return res.status(400).json({ ok: false, error: 'Missing userToken or transactionId' })
      const data = await circleJson<{ transaction?: Record<string, unknown> }>(`/v1/w3s/transactions/${encodeURIComponent(transactionId)}`, {
        method: 'GET',
        userToken,
        apiKey: circleApiKey({ chain }),
        headers: { accept: 'application/json' },
      })
      return res.json({ ok: true, transaction: data.transaction ?? data })
    }

    if (action === 'getChallenge') {
      const { userToken, challengeId, chain } = params
      if (!userToken || !challengeId) return res.status(400).json({ ok: false, error: 'Missing userToken or challengeId' })
      const data = await circleJson<{ challenge?: Record<string, unknown> }>(`/v1/w3s/user/challenges/${encodeURIComponent(challengeId)}`, {
        method: 'GET',
        userToken,
        apiKey: circleApiKey({ chain }),
        headers: { accept: 'application/json' },
      })
      return res.json({ ok: true, challenge: data.challenge ?? data })
    }

    if (action === 'signTypedData') {
      const { userToken, walletId, data: typedData, memo, chain } = params
      if (!userToken || !walletId || !typedData) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, or typed data' })
      }
      const result = await circleJson('/v1/w3s/user/sign/typedData', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey({ chain }),
        body: JSON.stringify({
          walletId,
          data: typedData,
          memo: memo || 'Hash PayLink typed-data signature',
        }),
      })
      return res.json({ ok: true, ...result })
    }

    if (action === 'signOwnWalletBridge') {
      const { validatePocketSolanaBridgeSigning } = await import('./pocket/solana-cctp-relay.js')
      await validatePocketSolanaBridgeSigning(req, params)
    }
    if (action === 'signPayment' || action === 'signOwnWalletBridge') {
      const { userToken, walletId, rawTransaction, memo } = params
      if (!userToken || !walletId || !rawTransaction) {
        return res.status(400).json({ ok: false, error: 'Missing userToken, walletId, or rawTransaction' })
      }
      const walletData = await circleJson<{ wallets: Array<{ id: string; address: string; blockchain: string }> }>('/v1/w3s/wallets', {
        method: 'GET',
        userToken,
        apiKey: circleApiKey(),
        headers: { accept: 'application/json' },
      })
      const wallet = walletData.wallets?.find((item) => item.id === walletId)
      if (!wallet || !isSolanaAddress(wallet.address)) {
        return res.status(400).json({ ok: false, error: 'Circle did not return a valid Solana wallet address. Reconnect with email and try again.' })
      }
      const data = await circleJson('/v1/w3s/user/sign/transaction', {
        method: 'POST',
        userToken,
        apiKey: circleApiKey(),
        body: JSON.stringify({
          walletId,
          rawTransaction,
          memo: memo || 'Hash PayLink USDC payment on Solana',
        }),
      })
      if (!data.challengeId) {
        console.error('[circle-solana-email] Missing signing challenge', {
          walletId,
          keys: Object.keys(data),
        })
      }
      return res.json({ ok: true, ...data })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('[circle-solana-email] Action failed', {
      action,
      chain: params.chain,
      blockchain: params.blockchain,
      message: err instanceof Error ? err.message : String(err),
    })
    return circleError(res, err)
  }
}

function normalizeSolanaUsdcAmount(value: string | undefined) {
  const match = String(value ?? '').trim().match(/^(\d+)(?:\.(\d{0,6})?)?$/)
  if (!match) throw Object.assign(new Error('Enter a valid USDC amount with up to 6 decimals.'), { status: 400 })
  const whole = BigInt(match[1])
  const fractionText = (match[2] ?? '').replace(/0+$/, '')
  if (whole === 0n && !/[1-9]/.test(fractionText)) {
    throw Object.assign(new Error('USDC amount must be greater than zero.'), { status: 400 })
  }
  return fractionText ? `${whole}.${fractionText}` : whole.toString()
}

export async function readCircleArcSwapChallenge(input: { userToken: string; walletId: string; walletAddress: string; challengeId: string }) {
  const owned = await readCircleUserWallet(input.userToken, 'arc', input.walletId)
  requireCircleGasStationEvmWallet({ chain: 'arc', walletId: input.walletId, walletAddress: input.walletAddress, wallets: owned ? [owned] : [] })
  const response = await circleJson<{ challenge?: Record<string, unknown> }>('/v1/w3s/user/challenges/' + encodeURIComponent(input.challengeId), { method: 'GET', userToken: input.userToken })
  const challenge = response.challenge
  if (!challenge) return { status: 'pending' as const }
  const ids = challenge.correlationIds
  const transactionId = Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : ''
  if (!transactionId) {
    const state = String(challenge.status ?? challenge.state ?? '').toUpperCase()
    return { status: ['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(state) ? 'failed' as const : 'pending' as const }
  }
  const data = await circleJson<{ transaction?: Record<string, unknown> }>('/v1/w3s/transactions/' + encodeURIComponent(transactionId), { method: 'GET', userToken: input.userToken })
  const tx = data.transaction
  if (!tx || tx.walletId !== input.walletId || tx.blockchain !== 'ARC') return { status: 'pending' as const }
  if (String(tx.state ?? tx.status).toUpperCase() === 'FAILED') return { status: 'failed' as const }
  return { status: 'pending' as const, txHash: typeof tx.txHash === 'string' ? tx.txHash : undefined }
}

// Internal migration transport. HTTP callers cannot supply these paths.
export async function circleMigrationRequest<T extends Record<string, unknown>>(userToken: string, chain: CircleGasStationEvmChain, path: string, body?: Record<string, unknown>) {
  if (!userToken || userToken.length > 8_000 || !path.startsWith('/v1/w3s/')) throw new Error('Invalid migration provider request.')
  return circleJson<T>(path, { migrationInternal:true, method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15_000), userToken, apiKey: circleApiKey({chain}), ...(body ? {body: JSON.stringify(body)} : {}) })
}
