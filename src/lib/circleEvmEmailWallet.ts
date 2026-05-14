import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { parseUnits, type Address, type Hex } from 'viem'
import type { ChainKey } from './chains'
import { CHAIN_META } from './chains'

type CircleSdkError = {
  message: string
}

type CircleChallengeResult = {
  type: string
  status: string
  data?: {
    id?: string
    transaction?: Record<string, unknown>
    transactionId?: string
    txHash?: Hex
    transactionHash?: Hex
  }
}

type CircleEmailLoginResult = {
  userToken: string
  encryptionKey: string
  refreshToken?: string
}

type CircleEvmWallet = {
  id: string
  address: Address
  blockchain: string
}

export type CircleEvmEmailSession = {
  userToken: string
  encryptionKey: string
  wallet: CircleEvmWallet
  chain: Extract<ChainKey, 'base' | 'arbitrum' | 'arc'>
}

const APP_ID = import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID as string | undefined
const ENABLED = import.meta.env.VITE_CIRCLE_EVM_EMAIL_ENABLED !== 'false'

const CHAIN_CONFIG = {
  base: { blockchain: 'BASE', label: 'Base' },
  arbitrum: { blockchain: 'ARB', label: 'Arbitrum' },
  arc: { blockchain: 'ARC-TESTNET', label: 'Arc' },
} as const

export function canUseCircleEvmEmailWallet(chain: ChainKey) {
  return ENABLED && !!APP_ID && (chain === 'base' || chain === 'arbitrum' || chain === 'arc')
}

function apiError(data: { error?: string; message?: string; code?: number }) {
  const msg = data.error ?? data.message ?? 'Circle email wallet request failed.'
  if (data.code === 155106 || msg.toLowerCase().includes('already initialized')) return 'already_initialized'
  return msg
}

function sdkError(error?: unknown) {
  if (!error) return 'Circle wallet action did not complete.'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const message = (error as Partial<CircleSdkError>).message
  if (!message) {
    try {
      const body = JSON.stringify(error)
      return body && body !== '{}' ? body.slice(0, 160) : 'Circle wallet action did not complete.'
    } catch {
      return 'Circle wallet action did not complete.'
    }
  }
  const lower = message.toLowerCase()
  if (lower.includes('cancel') || lower.includes('user')) return 'Circle wallet confirmation was cancelled.'
  return message.slice(0, 160)
}

function readableError(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    const json = JSON.stringify(err)
    return json && json !== '{}' ? json : 'Circle email wallet request failed.'
  } catch {
    return 'Circle email wallet request failed.'
  }
}

function emailVerificationError(err: unknown) {
  const message = readableError(err)
  const lower = message.toLowerCase()
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('load failed')
  ) {
    return 'Email verification could not reach Circle. Request a new code, disable VPN/ad blockers, and try again.'
  }
  if (lower.includes('expired') || lower.includes('invalid') || lower.includes('otp') || lower.includes('code')) {
    return 'Email verification code is invalid or expired. Request a new code and try again.'
  }
  return message
}

function isHexHash(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)
}

function findTxHash(value: unknown): Hex | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const direct = record.txHash ?? record.transactionHash ?? record.tx_hash
  if (isHexHash(direct)) return direct
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      const found = findTxHash(nested)
      if (found) return found
    }
  }
  return null
}

function findTransactionId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const direct = record.transactionId ?? record.transactionID ?? record.id
  if (typeof direct === 'string' && direct) return direct
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      const found = findTransactionId(nested)
      if (found) return found
    }
  }
  return null
}

function transactionState(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return String(record.state ?? record.status ?? '').toUpperCase()
}

async function circleWalletApi<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/circle-solana-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string; code?: number }
  if (!res.ok || data.ok === false) throw new Error(apiError(data))
  return data as T
}

function executeChallenge(sdk: W3SSdk, challengeId: string) {
  return new Promise<CircleChallengeResult>((resolve, reject) => {
    sdk.execute(challengeId, (error, result) => {
      if (error) {
        reject(new Error(sdkError(error)))
        return
      }
      if (!result) {
        reject(new Error('Circle wallet action did not complete.'))
        return
      }
      resolve(result as CircleChallengeResult)
    })
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function getWallet(userToken: string, chain: Extract<ChainKey, 'base' | 'arbitrum' | 'arc'>): Promise<CircleEvmWallet | null> {
  const data = await circleWalletApi<{ wallet?: CircleEvmWallet | null }>({
    action: 'listWallets',
    userToken,
    chain,
  })
  return data.wallet ?? null
}

async function ensureEvmWallet(
  sdk: W3SSdk,
  userToken: string,
  encryptionKey: string,
  chain: Extract<ChainKey, 'base' | 'arbitrum' | 'arc'>,
) {
  sdk.setAuthentication({ userToken, encryptionKey })
  let wallet = await getWallet(userToken, chain)
  if (wallet) return wallet

  const config = CHAIN_CONFIG[chain]
  try {
    const init = await circleWalletApi<{ challengeId?: string }>({
      action: 'initializeUser',
      userToken,
      blockchain: config.blockchain,
      accountType: 'SCA',
    })
    if (init.challengeId) await executeChallenge(sdk, init.challengeId)
  } catch (err) {
    if (readableError(err) !== 'already_initialized') throw err
  }

  wallet = await getWallet(userToken, chain)
  if (wallet) return wallet

  const created = await circleWalletApi<{ challengeId?: string }>({
    action: 'createWallet',
    userToken,
    blockchain: config.blockchain,
    accountType: 'SCA',
    name: `Hash PayLink ${config.label}`,
  })
  if (!created.challengeId) throw new Error('Circle did not return an EVM wallet challenge.')
  await executeChallenge(sdk, created.challengeId)

  wallet = await getWallet(userToken, chain)
  if (!wallet) throw new Error('Circle EVM smart wallet is not ready yet.')
  return wallet
}

export async function connectCircleEvmEmailWallet(
  email: string,
  chain: ChainKey,
): Promise<CircleEvmEmailSession> {
  if (!APP_ID) throw new Error('Circle email wallet is not configured.')
  if (chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') throw new Error('Circle email wallet is not enabled for this chain.')
  const sdk = new W3SSdk({ appSettings: { appId: APP_ID } })
  const deviceId = await sdk.getDeviceId()
  const otp = await circleWalletApi<{
    deviceToken: string
    deviceEncryptionKey: string
    otpToken: string
  }>({
    action: 'requestEmailOtp',
    deviceId,
    email,
  })

  const login = await withTimeout(new Promise<CircleEmailLoginResult>((resolve, reject) => {
    sdk.updateConfigs({
      appSettings: { appId: APP_ID },
      loginConfigs: {
        deviceToken: otp.deviceToken,
        deviceEncryptionKey: otp.deviceEncryptionKey,
        otpToken: otp.otpToken,
      },
    }, (error, result) => {
      if (error) {
        reject(new Error(emailVerificationError(error)))
        return
      }
      if (!result?.userToken || !result.encryptionKey) {
        reject(new Error('Circle email verification did not return a wallet session. Request a new code and try again.'))
        return
      }
      resolve(result)
    })
    try {
      sdk.verifyOtp()
    } catch (err) {
      reject(new Error(emailVerificationError(err)))
    }
  }), 90_000, 'Email verification was cancelled or expired. Request a new code and try again.')

  const wallet = await ensureEvmWallet(sdk, login.userToken, login.encryptionKey, chain)
  return {
    userToken: login.userToken,
    encryptionKey: login.encryptionKey,
    wallet,
    chain,
  }
}

async function pollTransactionHash(session: CircleEvmEmailSession, transactionId: string) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const data = await circleWalletApi<{
      transaction?: {
        txHash?: Hex
        transactionHash?: Hex
        state?: string
        status?: string
      }
    }>({
      action: 'getTransaction',
      userToken: session.userToken,
      transactionId,
    })
    const txHash = findTxHash(data.transaction)
    if (txHash) return txHash
    const state = transactionState(data.transaction)
    if (state.includes('FAILED') || state.includes('CANCEL')) throw new Error('Circle email wallet transaction failed.')
    await new Promise(resolve => setTimeout(resolve, 2_500))
  }
  return null
}

export async function sendCircleEvmEmailPayment(params: {
  session: CircleEvmEmailSession
  recipient: Address
  amount: string
}) {
  if (!APP_ID) throw new Error('Circle email wallet is not configured.')
  const sdk = new W3SSdk({
    appSettings: { appId: APP_ID },
    authentication: {
      userToken: params.session.userToken,
      encryptionKey: params.session.encryptionKey,
    },
  })
  const totalUnits = parseUnits(params.amount || '0', CHAIN_META[params.session.chain].decimals)
  const challenge = await circleWalletApi<{ challengeId?: string }>({
    action: 'executeEvmPayment',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    walletAddress: params.session.wallet.address,
    chain: params.session.chain,
    recipient: params.recipient,
    totalUnits: totalUnits.toString(),
  })
  if (!challenge.challengeId) throw new Error('Circle did not return an EVM payment challenge.')
  const result = await executeChallenge(sdk, challenge.challengeId)
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result.data)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId).catch(() => null)
    if (hash) return hash
  }
  return null
}

export async function sendCircleArcStream(params: {
  session: CircleEvmEmailSession
  factoryAddress: Address
  recipient: Address
  amountUnits: string
  startTime: string
  endTime: string
  salt: Hex
  predictedVault: Address
}) {
  if (!APP_ID) throw new Error('Circle email wallet is not configured.')
  if (params.session.chain !== 'arc') throw new Error('Arc StreamPay requires an Arc Circle smart wallet.')
  const sdk = new W3SSdk({
    appSettings: { appId: APP_ID },
    authentication: {
      userToken: params.session.userToken,
      encryptionKey: params.session.encryptionKey,
    },
  })
  const challenge = await circleWalletApi<{ challengeId?: string }>({
    action: 'executeArcStream',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    walletAddress: params.session.wallet.address,
    factoryAddress: params.factoryAddress,
    recipient: params.recipient,
    amountUnits: params.amountUnits,
    startTime: params.startTime,
    endTime: params.endTime,
    salt: params.salt,
    predictedVault: params.predictedVault,
  })
  if (!challenge.challengeId) throw new Error('Circle did not return an Arc stream challenge.')
  const result = await executeChallenge(sdk, challenge.challengeId)
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result.data)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId).catch(() => null)
    if (hash) return hash
  }
  return null
}
