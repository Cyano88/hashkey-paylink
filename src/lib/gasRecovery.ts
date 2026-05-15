import { parseUnits } from 'viem'
import type { ChainKey } from './chains'

const DEFAULT_RECOVERY_USDC: Partial<Record<ChainKey, string>> = {
  base: '0.01',
  arbitrum: '0.03',
  solana: '0.01',
}

function configuredRecoveryAmount(chain: ChainKey) {
  if (chain === 'base') return import.meta.env.VITE_BASE_GAS_RECOVERY_USDC ?? DEFAULT_RECOVERY_USDC.base
  if (chain === 'arbitrum') return import.meta.env.VITE_ARBITRUM_GAS_RECOVERY_USDC ?? DEFAULT_RECOVERY_USDC.arbitrum
  if (chain === 'solana') return import.meta.env.VITE_SOLANA_GAS_RECOVERY_USDC ?? DEFAULT_RECOVERY_USDC.solana
  return '0'
}

export function getSponsoredGasRecoveryUnits(
  chain: ChainKey,
  totalUnits: bigint,
  platformFeeUnits: bigint,
  decimals: number,
) {
  const amount = configuredRecoveryAmount(chain)
  let configured = 0n
  try {
    configured = parseUnits(amount || '0', decimals)
  } catch {
    configured = 0n
  }

  if (configured <= 0n) return 0n
  const maxRecoverable = totalUnits - platformFeeUnits - 1n
  if (maxRecoverable <= 0n) return 0n
  return configured > maxRecoverable ? maxRecoverable : configured
}
