export type CheckoutSelectionView = {
  paymentMethods?:Array<'stablecoins'|'cash_balance'>; paymentMethod?:'stablecoins'|'cash_balance';
  currency?: 'NGN'; settlementMode?: 'usdc'|'ngn'|'ugx'; defaultNetwork?: string;
  id: string; amount: string; merchantName: string; brandImageUrl?: string; title?: string; expiresAt: string;
  options: Array<{network:string;asset:string;unavailableReason?:string}>;
  preparingOption?:{network:string;asset:string}; canChange?:boolean; selectedCheckoutId?:string;
  selected?: {network:string;asset:string};
}
export const isSelectedCheckoutPath=(value:unknown):value is string=>typeof value==='string'&&/^\/pay\/c\/chk(?:b|x)?_[a-zA-Z0-9]{8,40}(?:\?attempt=[a-zA-Z0-9_-]+)?$/.test(value)
export async function selectHostedCheckoutOption(id:string,choice:{network:string;asset:string},endpoint='/api/v2/checkouts',signal?:AbortSignal,expectedCheckoutId?:string,cash?:{accessToken:string}){
  if(!/^chks_[a-f0-9]{24}$/.test(id))throw Error('Invalid checkout reference.')
  const response=await fetch(endpoint+'?id='+encodeURIComponent(id)+'&action=select-payment',{method:'POST',headers:{'Content-Type':'application/json',...(cash?{Authorization:'Bearer '+cash.accessToken}:{})},body:JSON.stringify({...(cash?{paymentMethod:'cash_balance'}:{}),network:choice.network,asset:choice.asset,...(expectedCheckoutId?{expectedCheckoutId}:{})}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000)})
  const data=await response.json().catch(()=>null)
  if(!response.ok||!data?.ok)throw Error(data?.error||'Payment could not be prepared.')
  if(!isSelectedCheckoutPath(data.selectedCheckoutUrl))throw Error('Checkout could not be verified.')
  return data.selectedCheckoutUrl
}
