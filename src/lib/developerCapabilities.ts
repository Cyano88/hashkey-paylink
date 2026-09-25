import { developerCheckoutNetworks } from './developerNetworkPolicy.js'
// Public product contract; network support does not imply project or provider readiness.
export const DEVELOPER_CAPABILITIES_VERSION = 2
export const TEST_NETWORKS = {
  base_sepolia: { name: 'Base Sepolia', chainId: 84532, circleChain: 'BASE-SEPOLIA' },
  arbitrum_sepolia: { name: 'Arbitrum Sepolia', chainId: 421614, circleChain: 'ARB-SEPOLIA' },
  arc_testnet: { name: 'Arc Testnet', chainId: 5042002, circleChain: 'ARC-TESTNET' },
} as const
export const DEVELOPER_PRODUCTS = [
  { id: 'hosted_checkout', name: 'Human checkout', live: { networks: developerCheckoutNetworks('human'), status: 'project_configuration' }, sandbox: { networks: ['base_sepolia', 'arbitrum_sepolia', 'arc_testnet'], status: 'not_enabled', reason: 'Isolated testnet wallet, checkout and verification adapters are not enabled.' } },
  { id: 'agent_checkout', name: 'Agent checkout', live: { networks: developerCheckoutNetworks('agentic'), status: 'project_configuration' }, sandbox: { networks: ['base_sepolia', 'arc_testnet'], status: 'not_enabled', reason: 'Isolated testnet payment and reconciliation adapters are not enabled.' } },
  { id: 'arc_agreements', name: 'Agreements - Arc USDC', live: { networks: ['arc'], status: 'draft_only' }, sandbox: { networks: ['arc_testnet'], status: 'not_enabled', reason: 'Isolated draft storage and a reviewed testnet deployment are required before lifecycle testing.' } },
  { id: 'xstocks_agreements', name: 'Agreements - X Layer xStocks', live: { networks: ['xlayer'], status: 'project_activation_required' }, sandbox: { networks: [], status: 'not_enabled', reason: 'No isolated xStocks sandbox adapter is available.' } },
  { id: 'swap_arc', name: 'Swap - Arc', live: { networks: ['arc'], status: 'project_activation_required' }, sandbox: { networks: ['arc_testnet'], status: 'not_enabled', reason: 'The live wallet swap adapter cannot execute sandbox requests.' } },
  { id: 'swap_xlayer', name: 'Swap - X Layer', live: { networks: ['xlayer'], status: 'project_activation_required' }, sandbox: { networks: [], status: 'not_enabled', reason: 'No isolated X Layer swap sandbox adapter is available.' } },
  { id: 'bridge', name: 'Bridge', live: { networks: [], status: 'not_available' }, sandbox: { networks: [], status: 'not_enabled', reason: 'Pocket bridge routes are not exposed through a project-scoped builder API. X Layer bridging is not supported.' } },
  { id: 'polymarket_funding', name: 'Polymarket Funding', live: { networks: ['base', 'arbitrum'], status: 'project_configuration' }, sandbox: { networks: [], status: 'not_supported', reason: 'Live bridge movement only. No test funding or simulated completion.' } },
] as const
export function developerCapabilities() {
  return { version: DEVELOPER_CAPABILITIES_VERSION, sandboxPaymentsEnabled: false, sandboxKeysEnabled: false, testNetworks: TEST_NETWORKS, products: DEVELOPER_PRODUCTS }
}
