export const SPONSORED_SEND_MINIMUM_USD = 1
export const MINIMUM_SEND_MESSAGE = 'Minimum send is 1 USD.'
export type SendMinimumPrice = { usd:number; fetchedAt:number }
const stablecoins = new Set([
  '0xb6ceceab302e2e4948951ee7843fc24e92933061',
  '0x779ded0c9e1022225f8e0630b35a9b54be713736',
])
export const isXLayerSendStablecoin = (token:string) => stablecoins.has(token.toLowerCase())

export function assertSponsoredSendMinimum(token:string, units:bigint, decimals:number, price?:SendMinimumPrice, now=Date.now()) {
  if(units<=0n || !Number.isInteger(decimals) || decimals<0 || decimals>36) throw Error('Invalid transfer amount.')
  if(isXLayerSendStablecoin(token)) {
    // Digital-dollar minimum is one token, with pinned six-decimal precision.
    if(decimals!==6) throw Error('Stablecoin precision could not be verified.')
    if(units<1_000_000n) throw Error(MINIMUM_SEND_MESSAGE)
    return
  }
  if(!price || !Number.isFinite(price.usd) || price.usd<=0 || !Number.isFinite(price.fetchedAt) || price.fetchedAt>now+5000 || now-price.fetchedAt>=60_000) throw Error('Refresh the asset price before sending.')
  // Floor the price rather than round a below-minimum amount up to $1. The
  // transfer amount always stays integer token units, including 18-decimal stocks.
  const scaled = Math.floor(price.usd*100_000_000)
  if(!Number.isSafeInteger(scaled)||scaled<=0) throw Error('Asset price could not be verified.')
  if(units*BigInt(scaled)<10n**BigInt(decimals)*100_000_000n) throw Error(MINIMUM_SEND_MESSAGE)
}
