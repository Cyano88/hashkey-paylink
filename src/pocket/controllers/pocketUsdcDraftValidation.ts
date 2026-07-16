import { isAddress } from 'viem'
import { isValidSolanaAddress } from '../../lib/solanaAddress'
import type { PocketNetwork } from '../lib/pocketSchemas'

export function normalizePocketAmountInput(value: string) {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [whole, ...fraction] = normalized.split('.')
  return fraction.length ? `${whole}.${fraction.join('')}` : whole
}

export function resolvePocketUsdcDraft({
  network,
  multiChain,
  flexibleAmount,
  amount,
  evmAddress,
  solanaAddress,
}: {
  network: PocketNetwork
  multiChain: boolean
  flexibleAmount: boolean
  amount: string
  evmAddress: string
  solanaAddress: string
}) {
  const evmDirty = evmAddress.length > 0
  const solanaDirty = solanaAddress.length > 0
  const amountDirty = amount.length > 0
  const evmValid = isAddress(evmAddress)
  const solanaValid = isValidSolanaAddress(solanaAddress)
  const amountValid = amountDirty && /^(?:\d+|\d*\.\d+)$/.test(amount) && Number(amount) > 0
  const hasAddress = multiChain
    ? evmValid || solanaValid
    : network === 'solana' ? solanaValid : evmValid
  const canGenerate = (flexibleAmount || amountValid) && hasAddress
  const addressGuidance = !canGenerate && (multiChain ? !evmDirty && !solanaDirty : network === 'solana' ? !solanaDirty : !evmDirty)
    ? multiChain
      ? 'Enter at least one wallet address to continue'
      : `Enter a ${network === 'solana' ? 'Solana' : 'wallet'} address to continue`
    : undefined

  return {
    evmDirty,
    solanaDirty,
    amountDirty,
    evmValid,
    solanaValid,
    amountValid,
    canGenerate,
    addressGuidance,
  }
}
