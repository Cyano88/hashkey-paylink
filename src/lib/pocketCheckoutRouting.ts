export type PocketCheckoutNetwork = 'base' | 'arbitrum' | 'solana'

export type PocketCheckoutBalance = { network: PocketCheckoutNetwork; units: bigint; available: boolean }

export type PocketCheckoutRoute =
  | { kind: 'direct'; destination: PocketCheckoutNetwork; amountUnits: bigint }
  | { kind: 'quote-required'; source: PocketCheckoutNetwork; destination: PocketCheckoutNetwork; amountUnits: bigint }
  | { kind: 'bridge'; source: PocketCheckoutNetwork; destination: PocketCheckoutNetwork; amountUnits: bigint; totalSourceUnits: bigint }
  | { kind: 'insufficient'; destination: PocketCheckoutNetwork; amountUnits: bigint; availableUnits: bigint }

const SOURCE_PRIORITY: PocketCheckoutNetwork[] = ['base', 'arbitrum', 'solana']

// Automatic Pocket payment routing must remain gas-sponsored end to end.
// EVM sources use Circle sponsorship, while Solana CCTP uses the validated
// Hash PayLink fee-payer relay. Each route still selects exactly one source.
const GAS_SPONSORED_BRIDGE_SOURCES = new Set<PocketCheckoutNetwork>(['base', 'arbitrum', 'solana'])

function balanceFor(balances: PocketCheckoutBalance[], network: PocketCheckoutNetwork) {
  return balances.find(balance => balance.network === network && balance.available)?.units ?? 0n
}

export function selectPocketCheckoutRoute(input: {
  destination: PocketCheckoutNetwork
  amountUnits: bigint
  balances: PocketCheckoutBalance[]
  bridgeTotals?: Partial<Record<PocketCheckoutNetwork, bigint>>
}): PocketCheckoutRoute {
  const destinationUnits = balanceFor(input.balances, input.destination)
  if (input.amountUnits > 0n && destinationUnits >= input.amountUnits) {
    return { kind: 'direct', destination: input.destination, amountUnits: input.amountUnits }
  }
  // Keep any USDC already available on the destination network and move only
  // the missing amount. A route still uses exactly one bridge source; balances
  // from multiple source networks are never combined.
  const bridgeAmountUnits = input.amountUnits > destinationUnits
    ? input.amountUnits - destinationUnits
    : 0n
  const sources = SOURCE_PRIORITY
    .filter(network => network !== input.destination && GAS_SPONSORED_BRIDGE_SOURCES.has(network))
    .map(network => ({ network, units: balanceFor(input.balances, network) }))
    .filter(source => source.units >= bridgeAmountUnits && bridgeAmountUnits > 0n)
    .sort((left, right) => left.units !== right.units
      ? (left.units > right.units ? -1 : 1)
      : SOURCE_PRIORITY.indexOf(left.network) - SOURCE_PRIORITY.indexOf(right.network))
  for (const source of sources) {
    const totalSourceUnits = input.bridgeTotals?.[source.network]
    if (totalSourceUnits === undefined) {
      return { kind: 'quote-required', source: source.network, destination: input.destination, amountUnits: bridgeAmountUnits }
    }
    if (source.units >= totalSourceUnits) {
      return { kind: 'bridge', source: source.network, destination: input.destination, amountUnits: bridgeAmountUnits, totalSourceUnits }
    }
  }
  const availableUnits = input.balances.filter(balance => balance.available).reduce((total, balance) => total + balance.units, 0n)
  return { kind: 'insufficient', destination: input.destination, amountUnits: input.amountUnits, availableUnits }
}
