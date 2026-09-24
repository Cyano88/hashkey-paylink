import { createHash } from 'node:crypto'
import { requireCircleGasStationEvmWallet, type CircleGasStationWalletRecord } from '../circle-evm-gas-station.js'
import { isEvmReplacementCandidate } from '../../src/lib/circleEvmReplacement.js'

export function missingPocketEvmWalletPlan(blockchain: string, peerId: string, wallets: (CircleGasStationWalletRecord & { refId?: string })[]) {
  if (!['BASE', 'ARB'].includes(blockchain) || !peerId || peerId.length > 256) throw Object.assign(new Error('Invalid wallet setup.'), { status: 400 })
  const owned = wallets.filter(wallet => !isEvmReplacementCandidate(wallet))
  const peer = owned.find(wallet => wallet.id === peerId)
  if (!peer) throw Object.assign(new Error('Wallet setup ownership could not be verified.'), { status: 403 })
  requireCircleGasStationEvmWallet({ chain: blockchain === 'BASE' ? 'arbitrum' : 'base', walletId: peer.id, walletAddress: peer.address, wallets: [peer] })
  const existing = owned.find(wallet => wallet.blockchain.trim().toUpperCase() === blockchain)
  if (existing) {
    requireCircleGasStationEvmWallet({ chain: blockchain === 'BASE' ? 'base' : 'arbitrum', walletId: existing.id, walletAddress: existing.address, wallets: [existing] })
    return { walletReady: true as const }
  }
  const hash = createHash('sha256').update('pocket-wallet-setup-v1|' + peer.id + '|' + blockchain).digest('hex')
  return { walletReady: false as const, idempotencyKey: hash.slice(0,8) + '-' + hash.slice(8,12) + '-4' + hash.slice(13,16) + '-a' + hash.slice(17,20) + '-' + hash.slice(20,32) }
}
