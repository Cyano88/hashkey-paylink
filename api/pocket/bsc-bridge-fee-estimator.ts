import {type Hex} from 'viem'
import {estimatePrivySponsoredBatchGas, type XLayerCostRpc} from './xlayer-sponsored-cost.js'
import {bscOutboundCalls, type BscOutboundQuote} from '../../src/pocket/lib/pocketBscOutboundBridge.js'

export type BscFeePrice = {scaled8: bigint; observedAt: number}
export type BscFeePolicy = {providerBps: number; providerAllowanceUsdMicros: bigint; marginBps: number; minimumFeeUnits: bigint; maximumFeeUnits: bigint}
const fail = (): never => {throw Error('BSC network fee is temporarily unavailable.')}
const ceil = (a: bigint, b: bigint) => (a + b - 1n) / b
function quantity(v: unknown): bigint {
 if (typeof v !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(v)) return fail()
 return BigInt(v)
}
/** A conservative estimate, not a Privy invoice. Actual billed cost must be
 * reconciled per transaction; wallet totals include other networks. */
export function priceBscSponsorship(networkWei: bigint, bnb: BscFeePrice, stable: BscFeePrice, policy: BscFeePolicy, now = Date.now()) {
 for (const p of [bnb, stable]) if (typeof p.scaled8 !== 'bigint' || p.scaled8 <= 0n || p.scaled8 > 10n ** 20n || !Number.isSafeInteger(p.observedAt) || p.observedAt > now + 5000 || p.observedAt + 30000 <= now) fail()
 if (![policy.providerAllowanceUsdMicros, policy.minimumFeeUnits, policy.maximumFeeUnits].every(v => typeof v === 'bigint')) return fail()
 if (typeof networkWei !== 'bigint' || networkWei <= 0n || networkWei >= 2n ** 256n || !Number.isSafeInteger(policy.providerBps) || policy.providerBps < 0 || policy.providerBps > 10000 || !Number.isSafeInteger(policy.marginBps) || policy.marginBps < 0 || policy.marginBps > 10000 || policy.providerAllowanceUsdMicros < 0n || policy.minimumFeeUnits < 0n || policy.maximumFeeUnits <= 0n || policy.maximumFeeUnits >= 2n ** 256n || policy.minimumFeeUnits > policy.maximumFeeUnits) fail()
 // BNB and BOTH Binance-pegged stablecoins have 18 decimals. Preserve the
 // full rational conversion until rounding UP into the user's stablecoin.
 const networkStable = ceil(networkWei * bnb.scaled8 * BigInt(10000 + policy.providerBps), stable.scaled8 * 10000n)
 const allowanceStable = ceil(policy.providerAllowanceUsdMicros * 10n ** 20n, stable.scaled8)
 const buffered = ceil((networkStable + allowanceStable) * BigInt(10000 + policy.marginBps), 10000n)
 const fee = buffered > policy.minimumFeeUnits ? buffered : policy.minimumFeeUnits
 if (fee > policy.maximumFeeUnits || fee <= 0n) fail()
 return fee
}
export function createBscBridgeFeeEstimator(d: {rpc: XLayerCostRpc; prices(asset: 'USDC' | 'USDT'): Promise<{bnb: BscFeePrice; stable: BscFeePrice}>; policy: BscFeePolicy; now?(): number}) {
 const policy = structuredClone(d.policy), now = d.now || Date.now
 return async (q: BscOutboundQuote, calls: ReturnType<typeof bscOutboundCalls>) => {
  if (q.from !== 'USDC' && q.from !== 'USDT') return fail()
  if (JSON.stringify(calls) !== JSON.stringify(bscOutboundCalls(q, now()))) return fail()
  const [gas, suggestion, spot, prices] = await Promise.all([
   estimatePrivySponsoredBatchGas(d.rpc, q.walletAddress as Hex, calls, 56),
   d.rpc('rundler_getUserOperationGasPrice', []), d.rpc('eth_gasPrice', []), d.prices(q.from),
  ])
  const suggested = quantity(suggestion?.suggested?.maxFeePerGas), nativePrice = quantity(spot)
  if (suggested <= 0n || nativePrice <= 0n) return fail()
  const blockNumber = quantity(suggestion?.blockNumber)
  const block = await d.rpc('eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false])
  if (quantity(block?.number) !== blockNumber || !/^0x[0-9a-f]{64}$/i.test(block?.hash)) return fail()
  const blockTime = Number(quantity(block.timestamp)) * 1000
  if (!Number.isSafeInteger(blockTime) || blockTime > now() + 5000 || blockTime + 30000 <= now()) return fail()
  // BSC is an L1: no X Layer L1 data fee or OP-stack oracle call.
  const networkWei = (gas.totalGas + 25000n) * (suggested > nativePrice ? suggested : nativePrice)
  const fee = priceBscSponsorship(networkWei, prices.bnb, prices.stable, policy, now())
  // The quoted margin is a reserve for changes before submission, not a second
  // margin that must be rebuilt on top of every fresh estimate. Keep provider
  // charges, allowance and minimum fee in the coverage floor.
  const coverageFee = priceBscSponsorship(networkWei, prices.bnb, prices.stable, {...policy, marginBps: 0}, now())
  const expiresAt = Math.min(q.expiresAt, prices.bnb.observedAt + 30000, prices.stable.observedAt + 30000, blockTime + 30000)
  if (expiresAt <= now()) return fail()
  return {feeUnits: String(fee), coverageFeeUnits: String(coverageFee), expiresAt}
 }
}
