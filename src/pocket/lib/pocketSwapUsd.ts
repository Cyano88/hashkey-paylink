/** Optional display metadata from the verified route, never an execution price. */
export function swapTokenUsdPrice(value: unknown): number | undefined {
 if(typeof value!=='string'&&typeof value!=='number')return
 if(typeof value==='string'&&!/^\d+(?:\.\d+)?$/.test(value))return
 const price=Number(value)
 return Number.isFinite(price)&&price>0?price:undefined
}
export function formatSwapOutputUsd(amount:string,price:unknown):string|undefined {
 const unit=swapTokenUsdPrice(price),quantity=Number(amount)
 if(!unit||!Number.isFinite(quantity)||quantity<=0)return
 const usd=quantity*unit
 if(!Number.isFinite(usd)||usd<=0)return
 return usd<0.01?'≈ <$0.01 USD':'≈ '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(usd)+' USD'
}
