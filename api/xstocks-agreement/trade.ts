import { keccak256, stringToHex, parseUnits } from 'viem'
import { parseWorkPayment, prepareWorkBinding, type WorkTermsForBinding } from './work.js'

export type TradeDetails = {
  offerId: string; listingRevision: number; snapshotHash: string
  price: string; deliveryFee: string; handover: 'Pickup' | 'Delivery'; location: string
  carrier: string; returns: string; dispatchDays: number; deliveryDays: number; inspectionHours: 24 | 48 | 72
}
function fail(message: string): never { throw Object.assign(Error(message), { status: 400 }) }
export function parseTradeCheckout(body: Record<string, unknown>, env: NodeJS.ProcessEnv): WorkTermsForBinding {
  const raw = body.trade as TradeDetails | undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Accepted Trade terms are required.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.offerId)
    || !Number.isSafeInteger(raw.listingRevision) || raw.listingRevision < 1 || !/^[a-f0-9]{64}$/.test(raw.snapshotHash)) fail('A preserved listing reference is required.')
  if (!Number.isInteger(raw.dispatchDays) || raw.dispatchDays < 1 || raw.dispatchDays > 30
    || !Number.isInteger(raw.deliveryDays) || raw.deliveryDays < 1 || raw.deliveryDays > 60
    || ![24,48,72].includes(raw.inspectionHours)) fail('Choose valid Trade deadlines.')
  if (!['Pickup','Delivery'].includes(raw.handover)) fail('Choose pickup or delivery.')
  const text = (value: unknown, min: number, max: number) => {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail('Complete the Trade description and handover terms.')
    return (value as string).trim()
  }
  for (const value of [raw.price, raw.deliveryFee]) if (typeof value !== 'string' || !/^\d{1,9}(\.\d{1,18})?$/.test(value)) fail('Use an exact stock quantity with up to 18 decimal places.')
  const decimals = Math.max(2, raw.price.split('.')[1]?.length || 0, raw.deliveryFee.split('.')[1]?.length || 0)
  const price = parseUnits(raw.price, decimals), fee = parseUnits(raw.deliveryFee, decimals)
  if (price <= 0n || (raw.handover === 'Pickup' && fee !== 0n)) fail('Invalid Trade quantity or pickup fee.')
  const scale = 10n ** BigInt(decimals)
  const total = price + fee, amount = `${total / scale}.${String(total % scale).padStart(decimals,'0')}`
  if (body.amount !== amount) fail('The payment quantity must equal the item price plus delivery fee.')
  const trade: TradeDetails = {
    offerId: raw.offerId.toLowerCase(), listingRevision: raw.listingRevision, snapshotHash: raw.snapshotHash,
    price: raw.price, deliveryFee: raw.deliveryFee, handover: raw.handover, location: text(raw.location,2,120),
    carrier: text(raw.carrier,raw.handover === 'Delivery' ? 1 : 0,120), returns: text(raw.returns,10,1000),
    dispatchDays: raw.dispatchDays, deliveryDays: raw.deliveryDays, inspectionHours: raw.inspectionHours,
  }
  const payment = parseWorkPayment({ paymentRail:'xlayer', paymentToken:body.paymentToken, reviewHours:trade.inspectionHours }, amount, trade.dispatchDays*86400, env)!
  return { kind:'trade', trade, version:1, title:text(body.title,1,160), description:text(body.description,1,4000), amount,
    durationSeconds:trade.dispatchDays*86400, xlayerPayment:payment }
}
export function prepareTradeCheckoutBinding(id: string, terms: WorkTermsForBinding, buyer: string, seller: string, now: number) {
  if (terms.kind !== 'trade' || !terms.trade) throw Error('Trade terms are unavailable.')
  const binding = prepareWorkBinding(id, terms, buyer, seller, now)
  // Separate namespace and digest: a delivery agreement must never become a work agreement.
  const contractTerms = { ...binding.contractTerms, offerId:keccak256(stringToHex('hashpaylink:trade:'+id)), deliveryWindow:terms.trade.deliveryDays*86400 }
  const termsHash = keccak256(stringToHex(JSON.stringify({ policy:'trade-xlayer-v1', id, terms, contractTerms })))
  return { ...binding, termsHash, contractTerms:{ ...contractTerms, termsHash } }
}

export function tradeCheckoutEnvironment(env:NodeJS.ProcessEnv,partnerId:string):NodeJS.ProcessEnv {
  const projects=(env.HASHPAYLINK_TRADE_XSTOCKS_PROJECTS||'').split(',').map(value=>value.trim()).filter(Boolean)
  return {...env,HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED:env.HASHPAYLINK_TRADE_XSTOCKS_ENABLED==='true'&&projects.includes(partnerId)?'true':'false'}
}
