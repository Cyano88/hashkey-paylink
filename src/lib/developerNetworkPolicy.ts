// Product policy shared by the portal and server. Sandbox execution remains disabled.
export const AGENT_CHECKOUT_NETWORKS = ['base', 'arc'] as const
export type AgentCheckoutNetwork = typeof AGENT_CHECKOUT_NETWORKS[number]
export function isAgentCheckoutNetwork(network: unknown): network is AgentCheckoutNetwork {
  return network === 'base' || network === 'arc'
}
export function developerCheckoutNetworks(mode: 'human' | 'agentic'): readonly ('base' | 'arbitrum' | 'arc')[] {
  return mode === 'agentic' ? AGENT_CHECKOUT_NETWORKS : ['base', 'arbitrum', 'arc']
}

export function developerProductNetworks(mode: 'human' | 'agentic', capabilities: readonly string[]): readonly ('base' | 'arbitrum' | 'arc')[] {
  const products = capabilities.length ? capabilities : ['hosted_checkout']
  const networks = new Set<'base' | 'arbitrum' | 'arc'>()
  if (products.includes('hosted_checkout')) developerCheckoutNetworks(mode).forEach(network => networks.add(network))
  if (products.includes('arc_agreements')) networks.add('arc')
  if (mode === 'human' && products.includes('polymarket_funding')) { networks.add('base'); networks.add('arbitrum') }
  return ['base', 'arbitrum', 'arc'].filter(network => networks.has(network as 'base' | 'arbitrum' | 'arc')) as ('base' | 'arbitrum' | 'arc')[]
}
