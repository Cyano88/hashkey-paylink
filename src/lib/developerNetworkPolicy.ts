// Product policy shared by the portal and server. Sandbox execution remains disabled.
export const AGENT_CHECKOUT_NETWORKS = ['base', 'arc'] as const
export type AgentCheckoutNetwork = typeof AGENT_CHECKOUT_NETWORKS[number]
export function isAgentCheckoutNetwork(network: unknown): network is AgentCheckoutNetwork {
  return network === 'base' || network === 'arc'
}
export function developerCheckoutNetworks(mode: 'human' | 'agentic'): readonly ('base' | 'arbitrum' | 'arc')[] {
  return mode === 'agentic' ? AGENT_CHECKOUT_NETWORKS : ['base', 'arbitrum', 'arc']
}
