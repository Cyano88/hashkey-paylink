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
const CIRCLE_EMAIL_VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000

export function canUseCircleSolanaEmailWallet() {
  return !!APP_ID
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

function closeCircleSdkModal() {
  const iframe = window.document.getElementById('sdkIframe')
  iframe?.parentNode?.removeChild(iframe)
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

function capturePocketViewport() {
  const scroller = document.querySelector<HTMLElement>('[data-pocket-scroller]')
  const scrollTop = scroller?.scrollTop ?? 0
  return () => {
    const restore = () => {
      const current = document.querySelector<HTMLElement>('[data-pocket-scroller]')
      if (current) current.scrollTop = scrollTop
    }
    window.requestAnimationFrame(restore)
    window.setTimeout(restore, 180)
  }
}

function executeChallenge(sdk: W3SSdk, challengeId: string) {
  const restorePocketViewport = capturePocketViewport()
  return new Promise<CircleChallengeResult>((resolve, reject) => {
    sdk.execute(challengeId, (error, result) => {
      restorePocketViewport()
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

function applyHashPayLinkCircleSolanaUi(sdk: W3SSdk) {
  sdk.setThemeColor({
    backdrop: '#020617',
    backdropOpacity: 0.42,
    bg: '#FFFFFF',
    error: '#DC2626',
    textMain: '#111827',
    textMain2: '#374151',
    textAuxiliary: '#6B7280',
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
    emailOtp: {
      title: 'Enter Circle code',
      subtitle: 'Use the newest code from your email. If it fails, resend for a clean code.',
      resendHint: 'Code not working?',
      resend: 'Resend code',
    },
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
  applyHashPayLinkCircleSolanaUi(sdk)
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
  let currentOtp = otp
  const restorePocketViewport = capturePocketViewport()

  const login = await withTimeout(new Promise<CircleEmailLoginResult>((resolve, reject) => {
    const handleClose = (event: MessageEvent) => {
      if (!isCircleCloseMessage(event.data)) return
      window.removeEventListener('message', handleClose)
      restorePocketViewport()
      reject(new Error('Payment cancelled. Try again.'))
    }
    const onLoginComplete = (error?: unknown, result?: CircleEmailLoginResult) => {
      window.removeEventListener('message', handleClose)
      restorePocketViewport()
      if (error) {
        closeCircleSdkModal()
        reject(new Error(emailVerificationError(error)))
        return
      }
      if (!result?.userToken || !result.encryptionKey) {
        closeCircleSdkModal()
        reject(new Error('Circle email verification did not return a wallet session. Request a new code and try again.'))
        return
      }
      resolve(result)
    }
    const refreshOtpConfig = () => {
      sdk.updateConfigs({
        appSettings: { appId: APP_ID },
        loginConfigs: {
          deviceToken: currentOtp.deviceToken,
          deviceEncryptionKey: currentOtp.deviceEncryptionKey,
          otpToken: currentOtp.otpToken,
        },
      }, onLoginComplete)
    }
    window.addEventListener('message', handleClose)
    sdk.setOnResendOtpEmail(() => {
      void circleSolanaApi<typeof currentOtp>({
        action: 'requestEmailOtp',
        deviceId,
        email,
      }).then(nextOtp => {
        currentOtp = nextOtp
        refreshOtpConfig()
      }).catch(err => {
        closeCircleSdkModal()
        window.removeEventListener('message', handleClose)
        reject(new Error(emailVerificationError(err)))
      })
    })
    refreshOtpConfig()
    try {
      sdk.verifyOtp()
    } catch (err) {
      window.removeEventListener('message', handleClose)
      closeCircleSdkModal()
      reject(new Error(emailVerificationError(err)))
    }
  }), CIRCLE_EMAIL_VERIFICATION_TIMEOUT_MS, 'Code expired. Request a new code.')

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
