import { getAddress, isAddress, type Address } from 'viem'

export type CircleGasStationEvmChain = 'base' | 'arbitrum' | 'arc'

export type CircleGasStationWalletRecord = {
  id: string
  address: string
  blockchain: string
  accountType?: string
  state?: string
  scaCore?: string
}
export const CIRCLE_GAS_STATION_EVM_NETWORKS = {
  base: { blockchain: 'BASE', environment: 'mainnet' },
  arbitrum: { blockchain: 'ARB', environment: 'mainnet' },
  arc: { blockchain: 'ARC-TESTNET', environment: 'testnet' },
} as const satisfies Record<CircleGasStationEvmChain, {
  blockchain: string
  environment: 'mainnet' | 'testnet'
}>

function blockchainMatches(chain: CircleGasStationEvmChain, blockchain: string) {
  const normalized = String(blockchain ?? '').trim().toUpperCase()
  if (chain === 'base') return normalized === 'BASE'
  if (chain === 'arbitrum') {
    return ['ARB', 'ARBITRUM', 'ARBITRUM-ONE', 'ARBITRUM_ONE', 'ARBITRUMONE'].includes(normalized)
  }
  return ['ARC-TESTNET', 'ARC_TESTNET', 'ARC'].includes(normalized)
}

function fail(message: string, status = 409) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

export function requireCircleGasStationEvmWallet(input: {
  chain: CircleGasStationEvmChain
  walletId: string
  walletAddress: string
  wallets: CircleGasStationWalletRecord[]
}) {
  const walletId = String(input.walletId ?? '').trim()
  const walletAddress = String(input.walletAddress ?? '').trim()
  if (!walletId || walletId.length > 256 || !isAddress(walletAddress)) {
    throw fail('A valid Circle EVM wallet is required.', 400)
  }

  const wallet = input.wallets.find(candidate => (
    candidate.id === walletId
    && isAddress(candidate.address)
    && getAddress(candidate.address) === getAddress(walletAddress)
    && blockchainMatches(input.chain, candidate.blockchain)
  ))
  if (!wallet) {
    throw fail('Circle wallet ownership could not be verified for this network.', 403)
  }
  if (String(wallet.accountType ?? '').trim().toUpperCase() !== 'SCA') {
    throw fail('This Circle wallet is not eligible for EVM gas sponsorship. Open a Circle smart wallet to continue.')
  }
  const state = String(wallet.state ?? '').trim().toUpperCase()
  if (state && state !== 'LIVE') {
    throw fail('This Circle smart wallet is not active.')
  }

  return Object.freeze({
    ...wallet,
    address: getAddress(wallet.address) as Address,
    accountType: 'SCA' as const,
  })
}
