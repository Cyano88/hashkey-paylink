import type { PocketBridgeNetwork } from '../api/pocketBridgeClient'

// Manual bridging supports all Pocket rails. Payment top-up policy is separate.
export const POCKET_BRIDGE_NETWORKS: readonly PocketBridgeNetwork[] = ['base', 'arbitrum', 'arc', 'solana', 'ethereum', 'polygon']
type PocketBridgeLabelNetwork=PocketBridgeNetwork|'xlayer'|'bsc'|'celo'
const pocketBridgeNetworkLabels:Record<PocketBridgeLabelNetwork,string>={base:'Base',arbitrum:'Arbitrum',arc:'Arc',solana:'Solana',ethereum:'Ethereum',polygon:'Polygon',xlayer:'X Layer',bsc:'BNB Chain',celo:'Celo'}
export const pocketBridgeNetworkLabel = (network: PocketBridgeLabelNetwork): string => pocketBridgeNetworkLabels[network]
export const pocketBridgeDestinations = (source: PocketBridgeNetwork) => POCKET_BRIDGE_NETWORKS.filter(network => network !== source)
export const savedPocketBridgeNetwork = (value: string | null): PocketBridgeNetwork => POCKET_BRIDGE_NETWORKS.includes(value as PocketBridgeNetwork) ? value as PocketBridgeNetwork : 'base'
