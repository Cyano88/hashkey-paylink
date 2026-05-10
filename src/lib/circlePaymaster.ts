import type { ChainKey } from './chains'
import { CHAIN_META } from './chains'

type CirclePaymasterChain = Extract<ChainKey, 'base' | 'arbitrum'>

type CirclePaymasterConfig = {
  chain: CirclePaymasterChain
  chainId: number
  usdcAddress: `0x${string}`
  paymasterAddress: `0x${string}`
  bundlerUrl: string
  entryPointVersion: '0.8'
}

const CIRCLE_PAYMASTER_V08_ADDRESS = '0x0578cFB241215b77442a541325d6A4E6dFE700Ec' as const
const PIMLICO_PUBLIC_BUNDLER = 'https://public.pimlico.io/v2'

const envEnabled = String(import.meta.env.VITE_CIRCLE_PAYMASTER_ENABLED ?? '').toLowerCase()

export const CIRCLE_PAYMASTER_ENABLED = envEnabled === '1' || envEnabled === 'true'

export const CIRCLE_PAYMASTER_SUPPORTED_CHAINS = ['base', 'arbitrum'] as const satisfies readonly CirclePaymasterChain[]

export function isCirclePaymasterChain(chain: ChainKey): chain is CirclePaymasterChain {
  return chain === 'base' || chain === 'arbitrum'
}

export function getCircleBundlerUrl(chain: CirclePaymasterChain) {
  const configured = chain === 'base'
    ? import.meta.env.VITE_CIRCLE_BUNDLER_URL_BASE
    : import.meta.env.VITE_CIRCLE_BUNDLER_URL_ARB

  if (configured) return configured as string
  return `${PIMLICO_PUBLIC_BUNDLER}/${CHAIN_META[chain].chainId}/rpc`
}

export function getCirclePaymasterAddress(chain: CirclePaymasterChain) {
  const configured = chain === 'base'
    ? import.meta.env.VITE_CIRCLE_PAYMASTER_V08_BASE
    : import.meta.env.VITE_CIRCLE_PAYMASTER_V08_ARB

  return (configured || CIRCLE_PAYMASTER_V08_ADDRESS) as `0x${string}`
}

export function getCirclePaymasterConfig(chain: ChainKey): CirclePaymasterConfig | null {
  if (!CIRCLE_PAYMASTER_ENABLED || !isCirclePaymasterChain(chain)) return null

  return {
    chain,
    chainId: CHAIN_META[chain].chainId,
    usdcAddress: CHAIN_META[chain].tokenAddress,
    paymasterAddress: getCirclePaymasterAddress(chain),
    bundlerUrl: getCircleBundlerUrl(chain),
    entryPointVersion: '0.8',
  }
}
