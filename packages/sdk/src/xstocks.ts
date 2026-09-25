/** Server-side xStocks Trade API. Never ship developer API keys to a browser. */
export type XStocksShareReceipt={policy:'xstocks-shares-v2';fundedShares:string;currentUnderlyingUnits:string;buyerSettledShares:string;sellerSettledShares:string;buyerUnderlyingAtSettlement:string;sellerUnderlyingAtSettlement:string;observedBlock:string}
export type XStocksTradeDraft={kind:'trade';stockCustody:'xstocks-shares-v2';title:string;description:string;amount:string;paymentToken:string;customerUserId:string;providerUserId:string;trade:{offerId:string;listingRevision:number;snapshotHash:string;price:string;deliveryFee:string;handover:'Pickup'|'Delivery';location:string;carrier:string;returns:string;dispatchDays:number;deliveryDays:number;inspectionHours:24|48|72}}
export type XStocksAgreement={id:string;checkoutPath:string;consentHash:string;stockReceipt?:XStocksShareReceipt;observed?:{state?:number;observedBlock?:string};terms:{kind?:'trade';stockCustody?:{policy:'xstocks-shares-v2';factory:string};amount:string;[key:string]:unknown}}
export function createXStocksAgreementClient(options:{apiKey:string;fetch?:typeof fetch}){
 if(typeof window!=='undefined')throw Error('Developer keys must remain on your server.');
 const send=async(path:string,init:RequestInit={})=>{
  const response=await (options.fetch||fetch)('https://app.hashpaylink.com/api/v2/xstocks-agreements'+path,{...init,redirect:'error',headers:{'content-type':'application/json','x-api-key':options.apiKey,...init.headers}});
  const data=await response.json().catch(()=>{throw Error('Agreement service returned an invalid response.');});
  if(!response.ok||data.ok!==true)throw Error(typeof data.error==='string'?data.error:'Agreement request failed.');
  return data;
 };
 return {
  async create(draft:XStocksTradeDraft,idempotencyKey:string):Promise<XStocksAgreement>{
   if(draft.kind!=='trade'||draft.stockCustody!=='xstocks-shares-v2')throw Error('Explicit share-based Trade custody is required.');
   if(!/^[a-zA-Z0-9:_-]{16,128}$/.test(idempotencyKey))throw Error('Use a valid idempotency key.');
   const data=await send('',{method:'POST',headers:{'idempotency-key':idempotencyKey},body:JSON.stringify(draft)});
   if(data.agreement?.terms?.stockCustody?.policy!==draft.stockCustody)throw Error('Returned custody policy does not match.');return data.agreement;
  },
  async get(id:string):Promise<XStocksAgreement>{if(!/^xag_[a-f0-9]{64}$/.test(id))throw Error('Invalid agreement ID.');return (await send('?id='+encodeURIComponent(id))).agreement;},
  async assets(){return send('?purpose=assets&kind=trade');}
 };
}
export function xStocksCheckoutUrl(agreement:Pick<XStocksAgreement,'id'|'checkoutPath'>){
 if(!/^xag_[a-f0-9]{64}$/.test(agreement.id)||agreement.checkoutPath!=='/agreements/xstocks/'+agreement.id)throw Error('Invalid hosted Agreement path.');
 return 'https://app.hashpaylink.com'+agreement.checkoutPath;
}
