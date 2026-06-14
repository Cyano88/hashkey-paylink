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
  appId?: string
}

const APP_ID = import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID as string | undefined
const ARC_TESTNET_APP_ID = import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET as string | undefined
const ENABLED = import.meta.env.VITE_CIRCLE_EVM_EMAIL_ENABLED !== 'false'
const CIRCLE_EMAIL_VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000

const CHAIN_CONFIG = {
  base: { blockchain: 'BASE', label: 'Base' },
  arbitrum: { blockchain: 'ARB', label: 'Arbitrum' },
  arc: { blockchain: 'ARC-TESTNET', label: 'Arc' },
} as const

export function canUseCircleEvmEmailWallet(chain: ChainKey) {
  return ENABLED && !!appIdForChain(chain) && (chain === 'base' || chain === 'arbitrum' || chain === 'arc')
}

function appIdForChain(chain: ChainKey) {
  return chain === 'arc' ? (ARC_TESTNET_APP_ID ?? APP_ID) : APP_ID
}

function apiError(data: { error?: string; message?: string; code?: number; detail?: string }, status?: number, action?: unknown) {
  const step = typeof action === 'string' ? action : 'request'
  const msg = data.error ?? data.message ?? (status ? `Circle email wallet request failed with HTTP ${status}.` : 'Circle email wallet request failed.')
  if (data.code === 155106 || msg.toLowerCase().includes('already initialized')) return 'already_initialized'
  const parts = [`${msg} (${step})`]
  if (data.code) parts.push(`code ${data.code}`)
  if (status && status >= 400) parts.push(`HTTP ${status}`)
  if (data.detail && data.detail !== msg) parts.push(data.detail.slice(0, 120))
  return parts.join(' · ').slice(0, 220)
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
  if (lower.includes('deviceid') || lower.includes('device id')) {
    return 'Smart wallet could not start. Refresh and try again.'
  }
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

function isCircleCloseMessage(data: unknown) {
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  if (record.onClose === true) return true
  return Object.values(record).some(value => {
    if (typeof value !== 'string') return false
    const lower = value.toLowerCase()
    return lower.includes('close') || lower.includes('cancel')
  })
}

function deviceIdError(err: unknown) {
  const message = readableError(err).toLowerCase()
  if (message.includes('cancel')) return 'Payment cancelled.'
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('deviceid') ||
    message.includes('device id')
  ) {
    return 'Circle Smart Wallet could not open. Refresh this page and try again.'
  }
  if (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('load failed')
  ) {
    return 'Circle Smart Wallet could not connect. Check your network and try again.'
  }
  return 'Circle Smart Wallet could not open. Refresh this page and try again.'
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
  const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string; code?: number; detail?: string }
  if (!res.ok || data.ok === false) throw new Error(apiError(data, res.status, payload.action))
  return data as T
}

function executeChallenge(sdk: W3SSdk, challengeId: string) {
  return new Promise<CircleChallengeResult>((resolve, reject) => {
    const handleClose = (event: MessageEvent) => {
      if (!isCircleCloseMessage(event.data)) return
      window.removeEventListener('message', handleClose)
      reject(new Error('Payment cancelled. Try again.'))
    }
    window.addEventListener('message', handleClose)
    sdk.execute(challengeId, (error, result) => {
      window.removeEventListener('message', handleClose)
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

function executeChallengeWithTimeout(sdk: W3SSdk, challengeId: string, message: string) {
  return withTimeout(executeChallenge(sdk, challengeId), 120_000, message)
}

function authenticatedSdk(session: CircleEvmEmailSession) {
  const appId = session.appId ?? appIdForChain(session.chain)
  if (!appId) throw new Error('Circle email wallet is not configured.')
  const sdk = new W3SSdk({ appSettings: { appId } })
  applyHashPayLinkCircleUi(sdk)
  sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey })
  return sdk
}

function applyHashPayLinkCircleUi(sdk: W3SSdk, context?: {
  amount?: string
  asset?: string
  recipient?: Address
  chainLabel?: string
}) {
  const asset = context?.asset ?? 'USDC'
  const amount = context?.amount
  const chainLabel = context?.chainLabel ?? 'Base'
  const shortRecipient = context?.recipient
    ? `${context.recipient.slice(0, 6)}...${context.recipient.slice(-4)}`
    : undefined

  sdk.setThemeColor({
    backdrop: '#020617',
    backdropOpacity: 0.42,
    divider: '#E5E7EB',
    bg: '#FFFFFF',
    success: '#059669',
    error: '#DC2626',
    textMain: '#111827',
    textMain2: '#374151',
    textAuxiliary: '#6B7280',
    textAuxiliary2: '#9CA3AF',
    titleGradients: ['#111827', '#0071E3'],
  })

  sdk.setResources({
    dAppIcon: '/hash-logo.png',
    transactionTokenIcon: '/brand/circle-logo.jpeg',
    fontFamily: {
      name: 'Inter',
      url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    },
  })

  sdk.setCustomLinks({
    learnMoreUrl: 'https://hashpaylink.com/docs',
  })

  sdk.setLocalizations({
    common: {
      continue: 'Continue',
      confirm: 'Confirm',
      sign: 'Approve',
    },
    socialEmailConfirm: {
      title: 'Hash PayLink',
      headline: 'Confirm your email to continue.',
    },
    transactionRequest: {
      title: 'Confirm payment',
      subtitle: amount
        ? `Approve ${amount} ${asset} on ${chainLabel}.`
        : `Approve this ${asset} payment on ${chainLabel}.`,
      fromLabel: 'Paying from',
      toLabel: 'Recipient',
      to: shortRecipient ? [shortRecipient] : undefined,
      totalLabel: 'Total',
      rawTxDescription: 'Secure payment authorization',
      rawTx: 'Circle protects this final approval before funds move.',
    },
    contractInteraction: {
      title: 'Confirm payment',
      subtitle: amount
        ? `Approve ${amount} ${asset} on ${chainLabel}.`
        : `Approve this ${asset} payment on ${chainLabel}.`,
      fromLabel: 'Smart wallet',
      contractAddressLabel: 'Payment contract',
      contractInfo: ['Hash PayLink payment approval'],
      totalLabel: 'Total',
      dataDetails: {
        dataDetailsLabel: 'Authorization details',
        callData: {
          callDataLabel: 'Secure call data',
          data: 'Payment is prepared by Hash PayLink and approved through Circle.',
        },
        abiInfo: {
          functionNameLabel: 'Action',
          functionName: 'Send USDC payment',
          parametersLabel: 'Payment details',
          parameters: [
            amount ? `Amount: ${amount} ${asset}` : `Asset: ${asset}`,
            `Network: ${chainLabel}`,
            ...(shortRecipient ? [`Recipient: ${shortRecipient}`] : []),
          ],
        },
      },
    },
    signatureRequest: {
      title: 'Approve payment',
      contractName: 'Hash PayLink',
      contractUrl: 'https://hashpaylink.com',
      subtitle: amount
        ? `Approve ${amount} ${asset} on ${chainLabel}.`
        : `Approve this ${asset} payment on ${chainLabel}.`,
      descriptionLabel: 'Request',
      description: 'Final Circle security confirmation for your Hash PayLink payment.',
    },
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
  if (chain !== 'base' && chain !== 'arbitrum' && chain !== 'arc') throw new Error('Circle email wallet is not enabled for this chain.')
  const appId = appIdForChain(chain)
  if (!appId) throw new Error('Circle email wallet is not configured.')
  const sdk = new W3SSdk({ appSettings: { appId } })
  applyHashPayLinkCircleUi(sdk, {
    asset: CHAIN_META[chain].asset,
    chainLabel: CHAIN_META[chain].label,
  })
  let deviceId: string
  try {
    deviceId = await withTimeout(
      sdk.getDeviceId(),
      15_000,
      'Smart wallet could not start. Refresh and try again.',
    )
  } catch (err) {
    throw new Error(deviceIdError(err))
  }
  const otp = await circleWalletApi<{
    deviceToken: string
    deviceEncryptionKey: string
    otpToken: string
  }>({
    action: 'requestEmailOtp',
    chain,
    deviceId,
    email,
  })

  const login = await withTimeout(new Promise<CircleEmailLoginResult>((resolve, reject) => {
    const handleClose = (event: MessageEvent) => {
      if (!event.data?.onClose) return
      window.removeEventListener('message', handleClose)
      reject(new Error('Payment cancelled.'))
    }
    window.addEventListener('message', handleClose)
    sdk.updateConfigs({
      appSettings: { appId },
      loginConfigs: {
        deviceToken: otp.deviceToken,
        deviceEncryptionKey: otp.deviceEncryptionKey,
        otpToken: otp.otpToken,
      },
    }, (error, result) => {
      window.removeEventListener('message', handleClose)
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
  }), CIRCLE_EMAIL_VERIFICATION_TIMEOUT_MS, 'Code expired. Request a new code.')

  const wallet = await ensureEvmWallet(sdk, login.userToken, login.encryptionKey, chain)
  return {
    userToken: login.userToken,
    encryptionKey: login.encryptionKey,
    wallet,
    chain,
    appId,
  }
}

async function pollTransactionHash(session: CircleEvmEmailSession, transactionId: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
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
      chain: session.chain,
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
  feeMode?: 'net' | 'gross'
}) {
  const sdk = authenticatedSdk(params.session)
  applyHashPayLinkCircleUi(sdk, {
    amount: params.amount,
    asset: CHAIN_META[params.session.chain].asset,
    recipient: params.recipient,
    chainLabel: CHAIN_META[params.session.chain].label,
  })
  const totalUnits = parseUnits(params.amount || '0', CHAIN_META[params.session.chain].decimals)
  const challenge = await circleWalletApi<{
    challengeId?: string
    id?: string
    transactionId?: string
    transaction?: Record<string, unknown>
  }>({
    action: 'executeEvmPayment',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    walletAddress: params.session.wallet.address,
    chain: params.session.chain,
    recipient: params.recipient,
    totalUnits: totalUnits.toString(),
    feeMode: params.feeMode ?? 'net',
  })
  if (!challenge.challengeId) throw new Error('Circle did not return an EVM payment challenge.')
  const result = await executeChallengeWithTimeout(
    sdk,
    challenge.challengeId,
    'Circle Smart Wallet confirmation did not finish. If you approved it, use Check Payment Status in a moment.',
  )
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result) ?? findTransactionId(challenge)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId, 3_500)
    if (hash) return hash
  }
  throw new Error('Circle accepted the payment, but the transaction hash is not available yet. Use Check Payment Status in a moment.')
}

export async function sendCircleEvmEmailWithdraw(params: {
  session: CircleEvmEmailSession
  recipient: Address
  amount: string
}) {
  const sdk = authenticatedSdk(params.session)
  applyHashPayLinkCircleUi(sdk, {
    amount: params.amount,
    asset: CHAIN_META[params.session.chain].asset,
    recipient: params.recipient,
    chainLabel: CHAIN_META[params.session.chain].label,
  })
  const totalUnits = parseUnits(params.amount || '0', CHAIN_META[params.session.chain].decimals)
  const challenge = await circleWalletApi<{
    challengeId?: string
    id?: string
    transactionId?: string
    transaction?: Record<string, unknown>
  }>({
    action: 'executeEvmWithdraw',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    walletAddress: params.session.wallet.address,
    chain: params.session.chain,
    recipient: params.recipient,
    totalUnits: totalUnits.toString(),
  })
  if (!challenge.challengeId) throw new Error('Circle did not return a withdraw challenge.')
  const result = await executeChallengeWithTimeout(
    sdk,
    challenge.challengeId,
    'Circle withdraw confirmation did not finish. If you approved it, check the destination wallet in a moment.',
  )
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result) ?? findTransactionId(challenge)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId)
    if (hash) return hash
  }
  return null
}

function findSignature(value: unknown): Hex | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const direct = record.signature ?? record.sig
  if (typeof direct === 'string' && /^0x[a-fA-F0-9]+$/.test(direct)) return direct as Hex
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === 'object') {
      const found = findSignature(nested)
      if (found) return found
    }
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
  if (params.session.chain !== 'arc') throw new Error('Arc StreamPay requires an Arc Circle smart wallet.')
  const sdk = authenticatedSdk(params.session)
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
  const result = await executeChallengeWithTimeout(
    sdk,
    challenge.challengeId,
    'Circle Smart Wallet confirmation did not finish. If you approved it, refresh this StreamPay link in a minute and check whether the stream deployed on Arc.',
  )
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId).catch(() => null)
    if (hash) return hash
  }
  return null
}

export async function sendCircleArcArenaJoin(params: {
  session: CircleEvmEmailSession
  escrowAddress: Address
  entryUnits: string
}) {
  if (params.session.chain !== 'arc') throw new Error('StreamPay Arena requires an Arc Circle smart wallet.')
  const sdk = authenticatedSdk(params.session)
  const challenge = await circleWalletApi<{ challengeId?: string }>({
    action: 'executeArcArenaJoin',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    walletAddress: params.session.wallet.address,
    escrowAddress: params.escrowAddress,
    entryUnits: params.entryUnits,
  })
  if (!challenge.challengeId) throw new Error('Circle did not return an Arena deposit challenge.')
  const result = await executeChallengeWithTimeout(
    sdk,
    challenge.challengeId,
    'Circle Smart Wallet confirmation did not finish. If you approved it, refresh this Arena room in a moment and check your seat.',
  )
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId).catch(() => null)
    if (hash) return hash
  }
  return null
}

export async function sendCircleArcArenaRefund(params: {
  session: CircleEvmEmailSession
  escrowAddress: Address
}) {
  if (params.session.chain !== 'arc') throw new Error('StreamPay Arena refunds require an Arc Circle smart wallet.')
  const sdk = authenticatedSdk(params.session)
  const challenge = await circleWalletApi<{ challengeId?: string }>({
    action: 'executeArcArenaRefund',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    walletAddress: params.session.wallet.address,
    escrowAddress: params.escrowAddress,
  })
  if (!challenge.challengeId) throw new Error('Circle did not return an Arena refund challenge.')
  const result = await executeChallengeWithTimeout(
    sdk,
    challenge.challengeId,
    'Circle Smart Wallet confirmation did not finish. If you approved it, refresh this Arena room in a moment and check your refund.',
  )
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId).catch(() => null)
    if (hash) return hash
  }
  return null
}

export async function deployCircleEvmEmailWallet(params: {
  session: CircleEvmEmailSession
}) {
  const sdk = authenticatedSdk(params.session)
  const challenge = await circleWalletApi<{ challengeId?: string }>({
    action: 'deployEvmWallet',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    walletAddress: params.session.wallet.address,
    chain: params.session.chain,
  })
  if (!challenge.challengeId) throw new Error('Circle did not return a wallet activation challenge.')
  const result = await executeChallengeWithTimeout(
    sdk,
    challenge.challengeId,
    'Circle Smart Wallet confirmation did not finish. If you approved it, use Check Payment Status in a moment.',
  )
  const txHash = findTxHash(result)
  if (txHash) return txHash
  const transactionId = findTransactionId(result)
  if (transactionId) {
    const hash = await pollTransactionHash(params.session, transactionId)
    if (hash) return hash
  }
  throw new Error('Circle accepted the payment, but the transaction hash is not available yet. Use Check Payment Status in a moment.')
}

export async function signCircleArcStreamClaim(params: {
  session: CircleEvmEmailSession
  vaultAddress: Address
  amountUnits: string
  nonce: string
  deadline: string
}) {
  if (params.session.chain !== 'arc') throw new Error('Arc StreamPay claim requires an Arc Circle smart wallet.')
  const sdk = authenticatedSdk(params.session)
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Claim: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Claim',
    domain: {
      name: 'StreamVault',
      version: '1',
      chainId: 5042002,
      verifyingContract: params.vaultAddress,
    },
    message: {
      recipient: params.session.wallet.address,
      amount: params.amountUnits,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  }
  const challenge = await circleWalletApi<{ challengeId?: string }>({
    action: 'signTypedData',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    chain: params.session.chain,
    data: JSON.stringify(typedData),
    memo: 'Claim Arc StreamPay USDC',
  })
  if (!challenge.challengeId) throw new Error('Circle did not return a typed-data signing challenge.')
  const result = await executeChallenge(sdk, challenge.challengeId)
  const signature = findSignature(result)
  if (!signature) {
    throw new Error('Circle did not return a usable EVM signature for this claim.')
  }
  return signature
}

export async function signCircleArcStreamCancel(params: {
  session: CircleEvmEmailSession
  vaultAddress: Address
  nonce: string
  deadline: string
}) {
  if (params.session.chain !== 'arc') throw new Error('Arc StreamPay cancellation requires an Arc Circle smart wallet.')
  const sdk = authenticatedSdk(params.session)
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Cancel: [
        { name: 'sender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Cancel',
    domain: {
      name: 'StreamVault',
      version: '1',
      chainId: 5042002,
      verifyingContract: params.vaultAddress,
    },
    message: {
      sender: params.session.wallet.address,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  }
  const challenge = await circleWalletApi<{ challengeId?: string }>({
    action: 'signTypedData',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    chain: params.session.chain,
    data: JSON.stringify(typedData),
    memo: 'End Arc StreamPay stream',
  })
  if (!challenge.challengeId) throw new Error('Circle did not return a typed-data signing challenge.')
  const result = await executeChallenge(sdk, challenge.challengeId)
  const signature = findSignature(result)
  if (!signature) {
    throw new Error('Circle did not return a usable EVM signature for this cancellation.')
  }
  return signature
}
