import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'

type CircleSdkError = {
  message: string
}

type CircleChallengeResult = {
  type: string
  status: string
  data?: {
    signedTransaction?: string
  }
}

type CircleEmailLoginResult = {
  userToken: string
  encryptionKey: string
  refreshToken?: string
}

type SolanaCircleWallet = {
  id: string
  address: string
  blockchain: string
}

type SolanaEmailSession = {
  userToken: string
  encryptionKey: string
  wallet: SolanaCircleWallet
}

const APP_ID = import.meta.env.VITE_CIRCLE_USER_WALLET_APP_ID as string | undefined
const ENABLED = import.meta.env.VITE_CIRCLE_SOLANA_EMAIL_ENABLED === 'true'

export function canUseCircleSolanaEmailWallet() {
  return ENABLED && !!APP_ID
}

function isSolanaAddress(address: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

function apiError(data: { error?: string; message?: string; code?: number }) {
  const msg = data.error ?? data.message ?? 'Circle Solana wallet request failed.'
  if (data.code === 155106 || msg.toLowerCase().includes('already initialized')) return 'already_initialized'
  return msg
}

function readableError(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    const json = JSON.stringify(err)
    return json && json !== '{}' ? json : 'Circle Solana wallet request failed.'
  } catch {
    return 'Circle Solana wallet request failed.'
  }
}

async function circleSolanaApi<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/circle-solana-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string; code?: number }
  if (!res.ok || data.ok === false) throw new Error(apiError(data))
  return data as T
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

async function getWallet(userToken: string): Promise<SolanaCircleWallet | null> {
  const data = await circleSolanaApi<{ wallet?: SolanaCircleWallet | null }>({
    action: 'listWallets',
    userToken,
  })
  return data.wallet ?? null
}

async function ensureInitializedWallet(sdk: W3SSdk, userToken: string, encryptionKey: string) {
  sdk.setAuthentication({ userToken, encryptionKey })
  let wallet = await getWallet(userToken)
  if (wallet) return wallet

  try {
      const init = await circleSolanaApi<{ challengeId?: string }>({
        action: 'initializeUser',
        userToken,
      })
      if (init.challengeId) await executeChallenge(sdk, init.challengeId)
  } catch (err) {
    if (readableError(err) !== 'already_initialized') throw err
  }

  wallet = await getWallet(userToken)
  if (wallet) return wallet

  const created = await circleSolanaApi<{ challengeId?: string }>({
    action: 'createWallet',
    userToken,
  })
  if (!created.challengeId) throw new Error('Circle did not return a Solana wallet challenge.')
  await executeChallenge(sdk, created.challengeId)

  wallet = await getWallet(userToken)
  if (!wallet) throw new Error('Circle Solana wallet is not ready yet.')
  return wallet
}

export async function connectCircleSolanaEmailWallet(email: string): Promise<SolanaEmailSession> {
  if (!APP_ID) throw new Error('Circle Solana email wallet is not configured.')
  const sdk = new W3SSdk({ appSettings: { appId: APP_ID } })
  const deviceId = await sdk.getDeviceId()
  const otp = await circleSolanaApi<{
    deviceToken: string
    deviceEncryptionKey: string
    otpToken: string
  }>({
    action: 'requestEmailOtp',
    deviceId,
    email,
  })

  const login = await new Promise<CircleEmailLoginResult>((resolve, reject) => {
    sdk.updateConfigs({
      appSettings: { appId: APP_ID },
      loginConfigs: {
        deviceToken: otp.deviceToken,
        deviceEncryptionKey: otp.deviceEncryptionKey,
        otpToken: otp.otpToken,
      },
    }, (error, result) => {
      if (error) {
        reject(new Error(sdkError(error)))
        return
      }
      if (!result?.userToken || !result.encryptionKey) {
        reject(new Error('Circle email verification did not return a wallet session.'))
        return
      }
      resolve(result)
    })
    sdk.verifyOtp()
  })

  const wallet = await ensureInitializedWallet(sdk, login.userToken, login.encryptionKey)
  if (!isSolanaAddress(wallet.address)) {
    throw new Error('Circle returned a non-Solana wallet address. Check that the User-Controlled Wallet App ID and API key are both Mainnet and Solana-enabled.')
  }
  return {
    userToken: login.userToken,
    encryptionKey: login.encryptionKey,
    wallet,
  }
}

export async function signCircleSolanaTransaction(params: {
  session: SolanaEmailSession
  rawTransaction: string
  memo: string
}) {
  if (!APP_ID) throw new Error('Circle Solana email wallet is not configured.')
  const sdk = new W3SSdk({
    appSettings: { appId: APP_ID },
    authentication: {
      userToken: params.session.userToken,
      encryptionKey: params.session.encryptionKey,
    },
  })
  const challenge = await circleSolanaApi<{ challengeId?: string }>({
    action: 'signPayment',
    userToken: params.session.userToken,
    walletId: params.session.wallet.id,
    rawTransaction: params.rawTransaction,
    memo: params.memo,
  })
  if (!challenge.challengeId) throw new Error('Circle did not return a signing challenge.')
  const result = await executeChallenge(sdk, challenge.challengeId)
  if (result.type !== 'SIGN_TRANSACTION' || !result.data?.signedTransaction) {
    throw new Error(`Circle did not return a signed Solana transaction. Status: ${result.status || 'unknown'}`)
  }
  return result.data.signedTransaction
}
