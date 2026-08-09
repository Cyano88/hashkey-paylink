import { PublicKey } from '@solana/web3.js'

export type CircleSolanaGasStationWalletRecord = {
  id: string
  address: string
  blockchain: string
  accountType?: string
  state?: string
}

function fail(message: string, status = 409) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function normalizedAddress(value: string) {
  try {
    return new PublicKey(String(value ?? '').trim()).toBase58()
  } catch {
    return ''
  }
}

export function requireCircleSolanaGasStationWallet(input: {
  walletId: string
  walletAddress: string
  wallets: CircleSolanaGasStationWalletRecord[]
}) {
  const walletId = String(input.walletId ?? '').trim()
  const walletAddress = normalizedAddress(input.walletAddress)
  if (!walletId || walletId.length > 256 || !walletAddress) {
    throw fail('A valid Circle Solana wallet is required.', 400)
  }

  const wallet = input.wallets.find(candidate => (
    candidate.id === walletId
    && normalizedAddress(candidate.address) === walletAddress
    && ['SOL', 'SOLANA'].includes(String(candidate.blockchain ?? '').trim().toUpperCase())
  ))
  if (!wallet) {
    throw fail('Circle wallet ownership could not be verified for Solana.', 403)
  }
  if (String(wallet.accountType ?? '').trim().toUpperCase() !== 'EOA') {
    throw fail('This Circle wallet is not eligible for Solana Gas Station sponsorship.')
  }
  const state = String(wallet.state ?? '').trim().toUpperCase()
  if (state && state !== 'LIVE') {
    throw fail('This Circle Solana wallet is not active.')
  }

  return Object.freeze({
    ...wallet,
    address: walletAddress,
    accountType: 'EOA' as const,
  })
}
