import { billLocalCurrency, normalizeInternationalBillPhone, type InternationalBillCountry, type InternationalBillCurrency } from '../src/pocket/lib/pocketBillCountry.js'

export type InternationalBill = {
  country: InternationalBillCountry; operatorId: string; productTypeId: '1' | '4';
  deliveryCurrency: InternationalBillCurrency; deliveryAmount: string;
}
export type InternationalVariation = {
  variationCode: string; name: string; fixedPrice: boolean;
  amount: number; minimum: number; maximum: number; rate: number; chargedAmount: number;
}
const invalid = () => Object.assign(new Error('This international mobile product is temporarily unavailable.'), { status: 503 })
export function internationalOperator(serviceId: string, country: InternationalBillCountry) {
  const match = new RegExp(`^${country.toLowerCase()}-(\\d{1,8})$`).exec(serviceId)
  if (!match) throw invalid()
  return match[1]
}
export function internationalVariations(content: any, productTypeId: '1' | '4', currency: InternationalBillCurrency): InternationalVariation[] {
  if (content?.currency !== currency || !Array.isArray(content.variations)) throw invalid()
  return content.variations.flatMap((v: any) => {
    const fixedPrice = v.fixedPrice === 'Yes'
    const amount = Number(v.variation_amount), minimum = Number(v.variation_amount_min), maximum = Number(v.variation_amount_max)
    const rate = Number(v.variation_rate), chargedAmount = Number(v.charged_amount)
    if (!/^\d+$/.test(String(v.variation_code)) || typeof v.name !== 'string' || v.charged_currency !== 'NGN'
      || ![minimum, maximum, rate].every(n => Number.isFinite(n) && n > 0) || maximum < minimum
      || fixedPrice && (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(chargedAmount) || chargedAmount <= 0)) return []
    // VTpass's data catalogue also contains voice/SMS-only bundles. Do not label them Data.
    if (productTypeId === '4' && (!fixedPrice || !/\b(?:\d+(?:\.\d+)?\s*(?:GB|MB)|data)\b/i.test(v.name))) return []
    return [{ variationCode: String(v.variation_code), name: v.name, fixedPrice, amount, minimum, maximum, rate, chargedAmount }]
  })
}
export function priceInternationalBill(variation: InternationalVariation, requested: unknown, currency: InternationalBillCurrency) {
  const raw = variation.fixedPrice ? String(variation.amount) : String(requested ?? '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw Object.assign(new Error(`Enter a valid ${currency} amount.`), {status:400})
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < variation.minimum || amount > variation.maximum) throw Object.assign(new Error(`Enter ${currency} ${variation.minimum}–${variation.maximum}.`), {status:400})
  const ngn = variation.fixedPrice ? variation.chargedAmount : Math.ceil((amount * variation.rate - 1e-8) * 100) / 100
  if (!Number.isSafeInteger(Math.round(ngn * 100)) || ngn <= 0) throw invalid()
  return { deliveryAmount: amount.toFixed(2), amountNgn: ngn.toFixed(2) }
}
export function assertInternationalBill(value: InternationalBill, phone: string) {
  if (value.deliveryCurrency !== billLocalCurrency(value.country) || !['1','4'].includes(value.productTypeId)
    || !/^\d{1,8}$/.test(value.operatorId) || !/^\d+(?:\.\d{1,2})?$/.test(value.deliveryAmount)
    || !Number.isSafeInteger(Math.round(Number(value.deliveryAmount)*100)) || Number(value.deliveryAmount) <= 0 || !normalizeInternationalBillPhone(value.country,phone)) throw invalid()
}
