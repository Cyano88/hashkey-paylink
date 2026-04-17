// Minimal type declarations for injected Starknet wallet providers (ArgentX, Braavos)
export {}

interface StarknetCall {
  contractAddress: string
  entrypoint: string
  calldata: string[]
}

interface StarknetAccount {
  address: string
  execute: (calls: StarknetCall[]) => Promise<{ transaction_hash: string }>
}

declare global {
  interface Window {
    starknet?: {
      id?: string
      name?: string
      isConnected: boolean
      selectedAddress?: string
      account?: StarknetAccount
      enable: () => Promise<string[]>
    }
    // Some wallets inject under their own key too
    starknet_argentX?: Window['starknet']
    starknet_braavos?: Window['starknet']
  }
}
