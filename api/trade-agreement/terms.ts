import { parseUnits } from 'viem'

export type TradeDetails = {
  offerId: string; listingRevision: number; snapshotHash: string
  price: string; deliveryFee: string; handover: 'Pickup' | 'Delivery'; location: string
  carrier: string; returns: string; dispatchDays: number; deliveryDays: number; inspectionHours: 24 | 48 | 72
}
function fail(message: string): never { throw Object.assign(Error(message), { status: 400 }) }
export function tradeText(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail('Complete the Trade description and handover terms.')
  return value.trim()
}
// Preserve stock property order and amount formatting for existing consent hashes.
export function parseTradeDetails(body: Record<string, unknown>, maxDecimals = 18) {
  const raw = body.trade as TradeDetails | undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Accepted Trade terms are required.')
  if (typeof raw.offerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.offerId)
    || !Number.isSafeInteger(raw.listingRevision) || raw.listingRevision < 1 || typeof raw.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.snapshotHash)) fail('A preserved listing reference is required.')
  if (!Number.isInteger(raw.dispatchDays) || raw.dispatchDays < 1 || raw.dispatchDays > 30
    || !Number.isInteger(raw.deliveryDays) || raw.deliveryDays < 1 || raw.deliveryDays > 60
    || ![24,48,72].includes(raw.inspectionHours)) fail('Choose valid Trade deadlines.')
  if (!['Pickup','Delivery'].includes(raw.handover)) fail('Choose pickup or delivery.')
  if (!Number.isInteger(maxDecimals) || maxDecimals < 2 || maxDecimals > 18) throw Error('Invalid Trade precision policy.')
  for (const value of [raw.price, raw.deliveryFee]) {
    if (typeof value !== 'string' || !/^\d{1,9}(\.\d{1,18})?$/.test(value)
      || (value.split('.')[1]?.length || 0) > maxDecimals) fail('Use an exact quantity within the payment precision.')
  }
  const decimals = Math.max(2, raw.price.split('.')[1]?.length || 0, raw.deliveryFee.split('.')[1]?.length || 0)
  const price = parseUnits(raw.price, decimals), fee = parseUnits(raw.deliveryFee, decimals)
  if (price <= 0n || (raw.handover === 'Pickup' && fee !== 0n)) fail('Invalid Trade quantity or pickup fee.')
  const scale = 10n ** BigInt(decimals), total = price + fee
  const amount = String(total / scale) + '.' + String(total % scale).padStart(decimals,'0')
  if (body.amount !== amount) fail('The payment quantity must equal the item price plus delivery fee.')
  const trade: TradeDetails = {
    offerId: raw.offerId.toLowerCase(), listingRevision: raw.listingRevision, snapshotHash: raw.snapshotHash,
    price: raw.price, deliveryFee: raw.deliveryFee, handover: raw.handover, location: tradeText(raw.location,2,120),
    carrier: tradeText(raw.carrier,raw.handover === 'Delivery' ? 1 : 0,120), returns: tradeText(raw.returns,10,1000),
    dispatchDays: raw.dispatchDays, deliveryDays: raw.deliveryDays, inspectionHours: raw.inspectionHours,
  }
  return { trade, amount }
}
