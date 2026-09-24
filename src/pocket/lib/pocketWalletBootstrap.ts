import type { SolanaEmailSession } from '../../lib/circleSolanaEmailWallet'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import type { CirclePocketWallets } from '../models/pocketWallet'
import type { PocketNetwork } from './pocketSchemas'

type ProviderWallet = { id: string; address: string; blockchain: string }
type Link = { wallet: ProviderWallet; updatedAt?: number }
type SolanaSession = SolanaEmailSession
export type WalletBootstrapDependencies = {
  read(): Promise<{ wallets: Partial<Record<PocketNetwork, Link>> }>
  evm(session: CircleEvmEmailSession, chain: 'base' | 'arbitrum'): Promise<CircleEvmEmailSession>
  additional(session: CircleEvmEmailSession, chain: 'ethereum' | 'polygon'): Promise<CircleEvmEmailSession>
  arc(session: CircleEvmEmailSession): Promise<CircleEvmEmailSession>
  solana(session: CircleEvmEmailSession, expectedAddress?: string): Promise<SolanaSession>
  link(network: PocketNetwork, session: { userToken: string; wallet: ProviderWallet }): Promise<unknown>
  save(session: CircleEvmEmailSession): Promise<void>
}
const networks = ['base', 'arbitrum', 'arc', 'solana', 'ethereum', 'polygon'] as const
const matches = (network: PocketNetwork, a: ProviderWallet, b: ProviderWallet) => a.id === b.id && a.blockchain === b.blockchain && (network === 'solana' ? a.address === b.address : a.address.toLowerCase() === b.address.toLowerCase())

/** One authenticated Circle session; never prompts for a separate network login or replaces a linked wallet. */
export async function preparePocketWalletNetworks(session: CircleEvmEmailSession, deps: WalletBootstrapDependencies, active: () => boolean = () => true) {
  const check = () => { if (!active()) throw new Error('Wallet setup cancelled.') }
  check()
  const before = (await deps.read()).wallets
  check()
  const sessions: Partial<Record<PocketNetwork, { userToken: string; wallet: ProviderWallet }>> = {}
  const accept = async (network: PocketNetwork, candidate: { userToken: string; wallet: ProviderWallet }) => {
    check()
    const existing = before[network]?.wallet
    if (existing && !matches(network, existing, candidate.wallet)) throw new Error('The restored ' + network + ' wallet does not match your Pocket account.')
    if (!existing) await deps.link(network, candidate)
    check()
    sessions[network] = candidate
  }
  const baseWallet = session.chain === 'base' ? session.wallet : session.productionEvmTopology?.wallets.base
  const base = baseWallet ? { ...session, chain: 'base' as const, wallet: baseWallet } : await deps.evm(session, 'base')
  await accept('base', base)
  const arbWallet = base.productionEvmTopology?.wallets.arbitrum
  const arb = arbWallet ? { ...base, chain: 'arbitrum' as const, wallet: arbWallet } : await deps.evm(base, 'arbitrum')
  await accept('arbitrum', arb)
  const arc = base.arcMainnetWallet ? { ...base, chain: 'arc' as const, wallet: base.arcMainnetWallet } : await deps.arc(base)
  await accept('arc', arc)
  const solana = await deps.solana(base, before.solana?.wallet.address)
  await accept('solana', solana)
  let additional = base
  for (const network of ['ethereum', 'polygon'] as const) {
    additional = await deps.additional(additional, network)
    await accept(network, additional)
  }
  const after = (await deps.read()).wallets
  check()
  const wallets: CirclePocketWallets = {}
  for (const network of networks) {
    const link = after[network], expected = sessions[network]!.wallet
    if (!link || !matches(network, link.wallet, expected)) throw new Error('Pocket could not confirm ' + network + ' wallet setup. Try again.')
    wallets[network] = { address: link.wallet.address, walletId: link.wallet.id, blockchain: link.wallet.blockchain, updatedAt: link.updatedAt }
  }
  const complete = { ...base, additionalWallets: additional.additionalWallets, productionEvmTopology: arb.productionEvmTopology ?? base.productionEvmTopology, arcMainnetWallet: arc.wallet }
  await deps.save(complete)
  check()
  return { session: complete, solana, wallets }
}
