export type XPayDestination = {adapter?:'xlayer'|'bsc';id:string;name:string;kind:'bank'|'stablecoins'|'xstocks';currency:string;assets:string[];networks?:string[];revision:string}
export type XPayCheckout = {id:string;name:string;destinations:XPayDestination[];createdAt:number;version?:number;deletedAt?:number;acceptance?:import('./xpayAcceptance.js').XPayAcceptance}
export function validateXPayDestinations(ids:unknown, available:XPayDestination[]) {
 if(!Array.isArray(ids)||!ids.length||ids.length>4||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Object.assign(Error('Choose your receiving options.'),{status:400})
 const selected=ids.map(id=>available.find(d=>d.id===id))
 if(selected.some(d=>!d))throw Object.assign(Error('A receiving option is no longer available.'),{status:400})
 const targets=selected as XPayDestination[]
 if(new Set(targets.map(d=>d.kind+':'+(d.adapter||''))).size!==targets.length)throw Object.assign(Error('Choose one destination for each receiving option.'),{status:400})
 if(new Set(targets.flatMap(d=>d.assets)).size>4)throw Object.assign(Error('Accept up to 4 stablecoins.'),{status:400})
 return targets
}
export function xpayDestinationDetail(d:XPayDestination) {
 return d.kind==='bank' ? 'Merchant receives '+d.currency+'. Pay with USDC on Base.' : 'Merchant receives '+d.assets.join(', ')+(d.kind==='xstocks'?' on X Layer':d.networks?.length?' on '+d.networks.map(n=>n==='base'?'Base':n==='arbitrum'?'Arbitrum':n==='arc'?'Arc':n==='ethereum'?'Ethereum':n==='polygon'?'Polygon':n==='solana'?'Solana':n).join(', '):'')+'.'
}

export type XPayHistoryEntry={merchantName?:string;id:string;rail:'stablecoins'|'xstocks';amount:string;asset:string;state:'pending'|'successful'|'failed'|'refunded'|'refunding';createdAt:number;hash?:string;network:string;bankDelivery?:string}
