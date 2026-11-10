/** Net settlement minimums. Fees are additional; these are not purchase limits. */
export const MARKETPLACE_WITHDRAWAL_MINIMUMS = {
  wallet: {amount: '0.50', units: '500000'},
  bank: {amount: '1.00', units: '1000000'},
} as const
export type MarketplaceWithdrawalRoute = keyof typeof MARKETPLACE_WITHDRAWAL_MINIMUMS

export function assertMarketplaceWithdrawalMinimum(route: MarketplaceWithdrawalRoute, netUnits: string) {
  const minimum = MARKETPLACE_WITHDRAWAL_MINIMUMS[route]
  if (typeof netUnits !== 'string' || !/^(0|[1-9]\d{0,23})$/.test(netUnits)) throw Error('Invalid withdrawal amount.')
  if (BigInt(netUnits) < BigInt(minimum.units)) throw Object.assign(
    Error(`Minimum ${route === 'bank' ? 'local bank' : 'wallet'} withdrawal is ${minimum.amount} USDC, plus applicable fees.`),
    {code: 'MARKETPLACE_WITHDRAWAL_BELOW_MINIMUM', minimumUnits: minimum.units, asset: 'USDC', route},
  )
}

/** A balance alone is never payout authorization or proof that fees are covered. */
export function marketplaceWithdrawalEligibility(availableUnits: string, route: MarketplaceWithdrawalRoute, feeUnits?: string) {
  for (const value of [availableUnits, ...(feeUnits === undefined ? [] : [feeUnits])]) {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,23})$/.test(value)) throw Error('Invalid withdrawal balance or fee.')
  }
  const minimum = MARKETPLACE_WITHDRAWAL_MINIMUMS[route]
  const required = BigInt(minimum.units) + BigInt(feeUnits ?? '0')
  const shortfall = required > BigInt(availableUnits) ? required - BigInt(availableUnits) : 0n
  return {minimumNetUnits: minimum.units, feesAdditional: true, quoteRequired: true,
    status: shortfall > 0n ? 'below_minimum' : feeUnits === undefined ? 'quote_required' : 'amount_eligible',
    shortfallUnits: shortfall.toString(), ...(feeUnits === undefined ? {} : {requiredDebitUnits: required.toString()})}
}
