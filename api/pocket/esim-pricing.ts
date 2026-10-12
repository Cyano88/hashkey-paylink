import { formatUnits } from 'viem'
import { paymentFeeBreakdown } from '../../src/lib/platformFees.js'

export type EsimPricePolicy = { mode: 'suggested' | 'markup'; markupBps?: number }
export type EsimPrice = { subtotal: string; platformFee: string; total: string; currency: 'USD'; days: number }

// Supplier prices use 1/10,000 USD; customer settlement uses 1/1,000,000.
// Round the retail plan price up to a cent; retain exact fee units for approval.
export function priceEsim(row: Record<string, unknown>, days: number, policy: EsimPricePolicy = { mode: 'suggested' }) {
  if (row.currencyCode !== 'USD' || !Number.isSafeInteger(row.price) || Number(row.price) <= 0) throw Error('ESIM_PRICE_UNAVAILABLE')
  if (![1, 2].includes(Number(row.dataType)) || row.durationUnit !== 'DAY' || !Number.isInteger(row.duration) || Number(row.duration) < 1) throw Error('ESIM_PLAN_UNAVAILABLE')
  const daily = Number(row.dataType) === 2
  if (!Number.isInteger(days) || days < 1 || days > 365 || (!daily && days !== row.duration)) throw Error('ESIM_INVALID_DURATION')
  const periods = BigInt(daily ? days : 1)
  const wholesale = BigInt(Number(row.price)) * periods
  let retail: bigint
  if (policy.mode === 'suggested') {
    if (!Number.isSafeInteger(row.retailPrice) || Number(row.retailPrice) <= 0) throw Error('ESIM_PRICE_UNAVAILABLE')
    retail = BigInt(Number(row.retailPrice)) * periods
  } else {
    if (!Number.isInteger(policy.markupBps) || policy.markupBps! < 0 || policy.markupBps! > 100_000) throw Error('ESIM_PRICE_POLICY_INVALID')
    retail = (wholesale * BigInt(10_000 + policy.markupBps!) + 9_999n) / 10_000n
  }
  if (retail < wholesale || wholesale > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('ESIM_PRICE_UNAVAILABLE')
  const subtotal = ((retail + 99n) / 100n) * 10_000n
  const fees = paymentFeeBreakdown(subtotal)
  return { supplierAmount: Number(wholesale), supplierUnitPrice: Number(row.price), public: {
    subtotal: formatUnits(subtotal, 6), platformFee: formatUnits(fees.platformFee, 6), total: formatUnits(fees.total, 6), currency: 'USD' as const, days,
  } }
}
