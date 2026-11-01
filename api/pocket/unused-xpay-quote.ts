// Fail closed: missing provider data alone is never evidence of an unused quote.
export function assertUnusedXPayQuote({intent,quote,merchant,ledger,order,now}: {
 intent: {kind:string;state:string;failureCode?:string;ownerId:string;resourceId?:string;amount:string;asset:string;transactionHash?:string;providerReference?:string;metadata:Record<string,string>};
 quote?: {intent_id:string;merchant_id:string;source?:string;xpay_checkout_id?:string;estimated_amount_usdc:string;expires_at:string};
 merchant?: {owner_id?:string}; ledger:Array<{state:string;transaction_hash?:string|null;provider_reference?:string|null}>;order:unknown;now:number
}) {
 const reject=()=>{throw Error('XPay quote is not proven unused; keep it for review.')}
 if(intent.kind!=='pos_settlement'||!['prepared','needs_review'].includes(intent.state))reject()
 if(intent.state==='needs_review'&&intent.failureCode!=='PAYOUT_RECORD_UNAVAILABLE')reject()
 if(intent.transactionHash||intent.providerReference||order)reject()
 if(!quote||!merchant||quote.source!=='pos'||!quote.xpay_checkout_id) return reject()
 if(quote.intent_id!==intent.resourceId||quote.merchant_id!==intent.metadata.merchantId||merchant.owner_id!==intent.ownerId)reject()
 if(intent.asset!=='USDC'||Number(quote.estimated_amount_usdc)!==Number(intent.amount)||!(Number(intent.amount)>0))reject()
 const expiry=Date.parse(quote.expires_at)
 if(!Number.isFinite(expiry)||expiry>=now)reject()
 if(!ledger.length||ledger.some(row=>!['prepared','needs_review'].includes(row.state)||row.transaction_hash||row.provider_reference))reject()
}
