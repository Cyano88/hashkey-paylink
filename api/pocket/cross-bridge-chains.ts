import {RELAY_BSC_CHAINS as BSC_RELAY_CHAINS} from './bsc-bridge-provider.js'

// Relay's Celo deployment uses the same verified Depository address as the
// existing EVM routes. Keep this map separate from the BNB-only adapter types.
export const CROSS_BRIDGE_RELAY_CHAINS={
 ...BSC_RELAY_CHAINS,
 celo:{id:42220,depository:'0x4cd00e387622c35bddb9b4c962c136462338bc31'},
} as const
export const RELAY_BSC_CHAINS=CROSS_BRIDGE_RELAY_CHAINS
export const crossBridgeProtocolChain=(network:keyof typeof CROSS_BRIDGE_RELAY_CHAINS)=>network==='bsc'?'bnb':network
export const crossBridgeVmTypes={bnb:'ethereum-vm',xlayer:'ethereum-vm',ethereum:'ethereum-vm',polygon:'ethereum-vm',arc:'ethereum-vm',base:'ethereum-vm',arbitrum:'ethereum-vm',solana:'solana-vm',celo:'ethereum-vm'} as const
