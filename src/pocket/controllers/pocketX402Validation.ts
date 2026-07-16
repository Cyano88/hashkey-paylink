import { normalizePocketAmountInput } from './pocketUsdcDraftValidation'

export function normalizePocketX402Amount(value: string) {
  const normalized = normalizePocketAmountInput(value)
  const [whole, fraction] = normalized.split('.')
  return fraction === undefined ? whole : `${whole}.${fraction.slice(0, 6)}`
}

export function pocketX402ActivationError(amount: string, walletBalance?: string) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount)) return 'Enter a valid x402 amount.'
  const parsed = Number(amount)
  if (!Number.isFinite(parsed) || parsed <= 0) return 'Enter a valid x402 amount.'
  if (parsed < 0.5) return 'Minimum x402 top up is 0.5 USDC.'
  if (parsed > 5) return 'Maximum x402 top up is 5 USDC.'
  if (walletBalance !== undefined && Number.isFinite(Number(walletBalance)) && parsed > Number(walletBalance)) {
    return 'Amount is higher than the current wallet balance.'
  }
  return ''
}
