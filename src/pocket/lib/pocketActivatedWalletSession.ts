import { isAddress } from 'viem'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import type { CircleEvmWalletRecord } from '../../lib/circleEvmWalletTopology'
type Wallets = Record<'base' | 'arbitrum' | 'arc', CircleEvmWalletRecord>
// Called only with the authenticated server restoration response; never local candidates.
export function applyActivatedWalletSession(session: CircleEvmEmailSession, wallets: Wallets): CircleEvmEmailSession {
  const networks = ['base', 'arbitrum', 'arc'] as const
  const chains = { base: 'BASE', arbitrum: 'ARB', arc: 'ARC' }
  if (networks.some(network => { const w=wallets?.[network]; return !w || !w.id || !isAddress(w.address) || w.blockchain !== chains[network] || w.accountType !== 'SCA' || w.state !== 'LIVE' }) || new Set(networks.map(n=>wallets[n].id)).size !== 3 || new Set(networks.map(n=>wallets[n].address.toLowerCase())).size !== 1) throw new Error('Activated Pocket wallets could not be restored.')
  const activeIds = new Set(networks.map(n=>wallets[n].id))
  const previous = [session.wallet, session.arcMainnetWallet, ...Object.values(session.productionEvmTopology?.wallets ?? {}), ...(session.productionEvmTopology?.legacyWallets ?? [])].filter((w): w is CircleEvmWalletRecord => Boolean(w?.id) && !activeIds.has(w!.id))
  const legacyWallets = [...new Map(previous.map(w=>[w.id,w])).values()]
  return { ...session, wallet: wallets[session.chain], arcMainnetWallet: wallets.arc, productionEvmTopology: { status: 'unified', canonicalAddress: wallets.base.address, wallets: { base: wallets.base, arbitrum: wallets.arbitrum }, legacyWallets, migrationRequired: false } }
}
