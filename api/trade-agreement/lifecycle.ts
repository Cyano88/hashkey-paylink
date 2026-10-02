import type { TradeXLayerAction } from '../../src/lib/xstocksAgreement/protocol.js'

export function tradeLifecycleActions(state: number, buyer: boolean, now: bigint, deadlines: { fundBy: bigint; dispatchBy: bigint; deliveryBy: bigint; inspectUntil: bigint }): TradeXLayerAction[] {
  if (state <= 1) return [...(now < deadlines.fundBy ? (state === 0 && !buyer ? ['accept' as const] : state === 1 && buyer ? ['fund' as const] : []) : []), 'cancel'];
  if (state === 2) return buyer ? (now >= deadlines.dispatchBy ? ['missedDispatch'] : []) : [...(now < deadlines.dispatchBy ? ['dispatch' as const] : []), 'refund'];
  if (state === 3) return buyer ? ['receipt','release','dispute'] : ['refund', ...(now >= deadlines.deliveryBy ? ['dispute' as const] : [])];
  if (state === 4) return buyer ? ['release', ...(now < deadlines.inspectUntil ? ['dispute' as const] : [])] : ['refund', ...(now >= deadlines.inspectUntil ? ['inspectionRelease' as const] : [])];
  if (state === 5) return buyer ? [] : ['refund'];
  return [];
}
