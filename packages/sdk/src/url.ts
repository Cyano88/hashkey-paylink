import { SUPPORTED_NETWORKS, type ChainKey } from './chains'
import type { PayLinkUrlOptions } from './types'

const DEFAULT_BASE_URL = 'https://hashpaylink.com'
const EVM_RE = /^0x[a-fA-F0-9]{40}$/
const STARK_RE = /^0x[a-fA-F0-9]{64}$/
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const AMOUNT_RE = /^(?:\d+|\d+\.\d{1,6}|\.\d{1,6})$/

export function isSupportedNetwork(value: string): value is ChainKey {
  return (SUPPORTED_NETWORKS as readonly string[]).includes(value)
}

export function isValidEvmAddress(value: string) {
  return EVM_RE.test(value.trim())
}

export function isValidStarknetAddress(value: string) {
  return STARK_RE.test(value.trim())
}

export function isLikelySolanaAddress(value: string) {
  return SOLANA_RE.test(value.trim())
}

export function isValidUsdcAmount(value: string) {
  return AMOUNT_RE.test(value.trim()) && Number(value) > 0
}

function cleanBaseUrl(baseUrl?: string) {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function buildPayLinkUrl(options: PayLinkUrlOptions) {
  const {
    baseUrl,
    network,
    recipientEVM,
    recipientSolana,
    recipientStark,
    amount,
    flexibleAmount,
    memo,
    multiChain,
    eventId,
    source,
    mode,
  } = options

  if (!flexibleAmount && !amount) throw new Error('amount is required unless flexibleAmount is true')
  if (amount && !isValidUsdcAmount(amount)) throw new Error('amount must be a positive number with up to 6 decimals')
  if (network && !isSupportedNetwork(network)) throw new Error(`unsupported network: ${network}`)
  if (recipientEVM && !isValidEvmAddress(recipientEVM)) throw new Error('recipientEVM must be a valid 0x address')
  if (recipientSolana && !isLikelySolanaAddress(recipientSolana)) throw new Error('recipientSolana must be a valid Solana address')
  if (recipientStark && !isValidStarknetAddress(recipientStark)) throw new Error('recipientStark must be a valid Starknet address')
  if (!recipientEVM && !recipientSolana && !recipientStark) throw new Error('at least one recipient address is required')

  const params = new URLSearchParams()
  if (flexibleAmount) params.set('f', '1')
  else if (amount) params.set('a', amount.trim())
  if (network) params.set('n', network)
  if (multiChain) params.set('x', '1')
  if (recipientEVM) params.set('e', recipientEVM.trim())
  if (recipientSolana) params.set('s', recipientSolana.trim())
  if (recipientStark) params.set('k', recipientStark.trim())
  if (memo?.trim()) params.set('m', memo.trim().slice(0, 120))
  if (eventId?.trim()) {
    params.set('v', '1')
    params.set('id', eventId.trim())
  }
  if (source?.trim()) params.set('src', source.trim().slice(0, 40))
  if (mode && mode !== 'wallet') params.set('mode', mode)

  return `${cleanBaseUrl(baseUrl)}/pay?${params.toString()}`
}
