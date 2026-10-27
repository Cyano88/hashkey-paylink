import {xLayerUsde,xLayerUsdg} from './pocketXLayerPaymentAssets'
export const xLayerFeeAssets={
 USDC:{address:'0xb6ceceab302e2e4948951ee7843fc24e92933061',decimals:6},
 USDT:{address:'0x779ded0c9e1022225f8e0630b35a9b54be713736',decimals:6},
 USDe:{address:xLayerUsde.address.toLowerCase(),decimals:18},
 USDG:{address:xLayerUsdg.address.toLowerCase(),decimals:6},
} as const
export type XLayerFeeAsset=keyof typeof xLayerFeeAssets
export const xLayerFeeScale=(asset:XLayerFeeAsset)=>10n**BigInt(xLayerFeeAssets[asset].decimals-6)
