export type CheckoutPricing={currency:'NGN';amount:string;paymentAmount:string;paymentAsset:'USDC'|'USDT';rate:string;source:'paycrest';referenceNetwork:'base';quotedAt:string}
export function checkoutPriceLabel(pricing:Pick<CheckoutPricing,'currency'|'amount'>|undefined,fallback:string){return pricing?new Intl.NumberFormat('en-NG',{style:'currency',currency:pricing.currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(pricing.amount)):fallback}

/** Stable field order survives JSONB storage and excludes object-key ordering from signatures. */
export function checkoutPricingFields(p:CheckoutPricing){return [p.currency,p.amount,p.paymentAmount,p.paymentAsset,p.rate,p.source,p.referenceNetwork,p.quotedAt]}
