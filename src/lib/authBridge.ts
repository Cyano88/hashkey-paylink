import { useMemo } from 'react'
import { usePrivy, useWallets, type ConnectedWallet } from '@privy-io/react-auth'
import { createWalletClient, custom, type Address, type Chain, type EIP1193Provider, type WalletClient } from 'viem'
import { useAccount, useDisconnect, useWalletClient } from 'wagmi'
import { arcChain, hashkeyMainnet } from './chains'
import { baseMainnet, arbitrumMainnet } from './wagmi'

export type AuthBridgeMode = 'legacy' | 'privy'

export type AuthBridgeWallet = {
  mode: AuthBridgeMode
  address?: Address
  walletClient?: WalletClient
}

type PrivyEthereumProvider = Awaited<ReturnType<ConnectedWallet['getEthereumProvider']>>

export type PrivyWalletClientResult = {
  address: Address
  provider: PrivyEthereumProvider
  walletClient: WalletClient
}

const EVM_CHAINS = [baseMainnet, arcChain, arbitrumMainnet, hashkeyMainnet] as const

function chainForId(chainId?: number): Chain {
  return EVM_CHAINS.find(chain => chain.id === chainId) ?? baseMainnet
}

function chainIdFromPrivy(wallet: ConnectedWallet) {
  const parts = wallet.chainId?.split(':') ?? []
  const raw = parts[parts.length - 1]
  const parsed = raw ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

export async function walletClientFromPrivyWallet(params: {
  wallet: ConnectedWallet
  chain?: Chain
}): Promise<PrivyWalletClientResult> {
  const chain = params.chain ?? chainForId(chainIdFromPrivy(params.wallet))
  await params.wallet.switchChain(chain.id)

  const provider = await params.wallet.getEthereumProvider()
  const accounts = await provider.request({ method: 'eth_accounts' })
  const address = Array.isArray(accounts) && isAddress(accounts[0])
    ? accounts[0]
    : isAddress(params.wallet.address)
      ? params.wallet.address
      : undefined

  if (!address) throw new Error('Privy wallet did not expose an EVM address.')

  const walletClient = createWalletClient({
    account: address,
    chain,
    transport: custom(provider as EIP1193Provider),
  })

  return { address, provider, walletClient }
}

export function useAuthBridge(): AuthBridgeWallet & {
  ready: boolean
  connectPrivy: () => void
  disconnect: () => Promise<void> | void
  getPrivyWalletClient: () => Promise<PrivyWalletClientResult>
} {
  const { authenticated, ready, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const { address: legacyAddress, chainId } = useAccount()
  const { data: legacyWalletClient } = useWalletClient({ account: legacyAddress })
  const { disconnect: disconnectLegacy } = useDisconnect()

  const activePrivyWallet = useMemo(
    () => wallets.find(wallet => wallet.address && wallet.walletClientType !== 'privy') ?? wallets[0],
    [wallets],
  )

  const hasPrivyWallet = authenticated && !!activePrivyWallet
  const mode: AuthBridgeMode = hasPrivyWallet ? 'privy' : 'legacy'
  const address = hasPrivyWallet && isAddress(activePrivyWallet.address)
    ? activePrivyWallet.address
    : legacyAddress

  return {
    mode,
    ready,
    address,
    walletClient: mode === 'legacy' ? legacyWalletClient : undefined,
    connectPrivy: login,
    disconnect: mode === 'privy' ? logout : disconnectLegacy,
    async getPrivyWalletClient() {
      if (!activePrivyWallet) throw new Error('No Privy wallet is connected.')
      return walletClientFromPrivyWallet({
        wallet: activePrivyWallet,
        chain: chainForId(chainId),
      })
    },
  }
}
