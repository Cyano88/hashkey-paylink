import { CHAIN_META } from './chains'

type ArgentSessionAccount = {
  address: string
  execute: (calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>) => Promise<{ transaction_hash: string }>
}

type ArgentWebWalletInstance = {
  sessionAccount?: ArgentSessionAccount
  connect: () => Promise<{ account: ArgentSessionAccount } | undefined>
  requestConnection: (args: { callbackData?: string }) => Promise<{ account: ArgentSessionAccount } | undefined>
  clearSession: () => Promise<void>
}

const ENABLED = import.meta.env.VITE_STARKNET_EMAIL_WALLET_ENABLED === 'true'
const APP_NAME = import.meta.env.VITE_ARGENT_APP_NAME || 'Hash PayLink'
const ENVIRONMENT = (import.meta.env.VITE_ARGENT_ENVIRONMENT || 'mainnet') as 'mainnet' | 'sepolia'
const SESSION_DAYS = Number(import.meta.env.VITE_ARGENT_SESSION_DAYS || '7')
const PAYMASTER_URL = import.meta.env.VITE_AVNU_STARKNET_PAYMASTER_URL || 'https://starknet.paymaster.avnu.fi'

let walletPromise: Promise<ArgentWebWalletInstance> | null = null

function getWallet() {
  if (!walletPromise) {
    walletPromise = import('@argent/invisible-sdk').then(({ ArgentWebWallet }) => ArgentWebWallet.init({
      appName: APP_NAME,
      environment: ENVIRONMENT,
      sessionParams: {
        allowedMethods: [
          {
            contract: CHAIN_META.starknet.tokenAddress,
            selector: 'transfer',
          },
        ],
        validityDays: Number.isFinite(SESSION_DAYS) && SESSION_DAYS > 0 ? SESSION_DAYS : 7,
      },
      paymasterParams: {
        baseUrl: PAYMASTER_URL,
        tokenAddress: CHAIN_META.starknet.tokenAddress,
      },
    }) as ArgentWebWalletInstance)
  }
  return walletPromise
}

export function canUseArgentStarknetEmailWallet() {
  return ENABLED
}

export async function connectArgentStarknetEmailWallet() {
  const wallet = await getWallet()
  const existing = await wallet.connect().catch(() => undefined)
  const response = existing ?? await wallet.requestConnection({ callbackData: 'hashpaylink-starknet' })
  if (!response?.account) throw new Error('Smart wallet connection was not completed.')
  return response.account
}

export async function clearArgentStarknetEmailWallet() {
  const wallet = await getWallet()
  await wallet.clearSession()
}
