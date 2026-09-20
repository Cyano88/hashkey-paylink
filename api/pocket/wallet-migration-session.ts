import { isAddress } from 'viem'
import { migrationActivationComplete } from './wallet-update-status.js'
import type { PocketWalletUpdateRecord } from './wallet-update-state.js'
import type { CircleLinkRecord } from '../privy-circle-link.js'
import type { CircleEvmWalletRecord } from '../../src/lib/circleEvmWalletTopology.js'
const networks = ['base', 'arbitrum', 'arc'] as const
const chains = { base: 'BASE', arbitrum: 'ARB', arc: 'ARC' }
export async function restoreActivatedMigrationWallets(input: {
  userId: string; record: PocketWalletUpdateRecord | undefined; links: Array<CircleLinkRecord | null>
  readOwnedWallet(network: typeof networks[number], id: string): Promise<{ id: string; address: string; blockchain: string; accountType?: string; state?: string } | null>
}) {
  if (!migrationActivationComplete(input.userId, input.record, input.links)) throw Object.assign(new Error('Wallet migration is not activated.'), { status: 409 })
  const wallets = await Promise.all(networks.map(async network => {
    const target = input.record!.targets![network]
    const wallet = await input.readOwnedWallet(network, target.walletId)
    if (!wallet || wallet.id !== target.walletId || !isAddress(wallet.address) || wallet.address.toLowerCase() !== target.address.toLowerCase() || wallet.blockchain !== chains[network] || wallet.accountType !== 'SCA' || wallet.state !== 'LIVE') throw Object.assign(new Error('Circle could not verify the activated wallet session.'), { status: 403 })
    // Return only public wallet identity metadata, never Circle authentication material.
    return { id: wallet.id, address: wallet.address, blockchain: wallet.blockchain, accountType: wallet.accountType, state: wallet.state } as CircleEvmWalletRecord
  }))
  if (new Set(wallets.map(wallet=>wallet.id)).size !== 3 || new Set(wallets.map(wallet=>wallet.address.toLowerCase())).size !== 1) throw Object.assign(new Error('Activated wallet topology does not match.'), { status: 409 })
  return { base: wallets[0], arbitrum: wallets[1], arc: wallets[2] }
}
