// Only executable checkout routes belong here; the broader Pocket catalogue is separate.
export const CHECKOUT_ACCEPTANCE = {
 base:['USDC'],arc:['USDC'],arbitrum:['USDC'],solana:['USDC','USDT'],ethereum:['USDC'],polygon:['USDC'],
} as const
export type CheckoutAcceptance = Partial<Record<keyof typeof CHECKOUT_ACCEPTANCE,string[]>>
export function acceptedCheckoutAssets(network:string, configured?:CheckoutAcceptance):readonly string[] {
 const supported=CHECKOUT_ACCEPTANCE[network as keyof typeof CHECKOUT_ACCEPTANCE]
 if(!supported)return []
 return configured?.[network as keyof typeof CHECKOUT_ACCEPTANCE]?.filter(asset=>(supported as readonly string[]).includes(asset)) ?? supported
}
export function normalizeCheckoutAcceptance(value:unknown,networks:readonly string[]):CheckoutAcceptance {
 const result:CheckoutAcceptance={}
 if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))throw Error('Choose accepted stablecoins for each network.')
 for(const network of networks){
  const supported=CHECKOUT_ACCEPTANCE[network as keyof typeof CHECKOUT_ACCEPTANCE]
  if(!supported)continue
  const selected=(value as Record<string,unknown>|undefined)?.[network]??supported
  if(!Array.isArray(selected)||!selected.length||selected.some(asset=>typeof asset!=='string'||!(supported as readonly string[]).includes(asset)))throw Error('Choose supported stablecoins for '+network+'.')
  result[network as keyof typeof CHECKOUT_ACCEPTANCE]=[...new Set(selected)]
 }
 return result
}
