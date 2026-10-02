const allowed=new Set(['/assistant','/home','/activity','/notifications','/activity/collections','/xstocks/request','/xstocks/home','/xstocks/activity','/xstocks/notifications'])
export function pocketNotificationPath(value:unknown):string|null {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return null
 try{const url=new URL(value,'https://pocket.invalid');if(url.origin!=='https://pocket.invalid'||!allowed.has(url.pathname))return null
 if(url.pathname==='/assistant'){const caseId=url.searchParams.get('case');return caseId&&/^pcs_[a-f0-9]{16}$/.test(caseId)?'/assistant?case='+encodeURIComponent(caseId):null}
 if(url.pathname==='/activity/collections')return url.searchParams.get('kind')==='requests'?'/activity/collections?kind=requests':null
 const receipt=url.searchParams.get('receipt');return url.pathname+(receipt&&receipt.length<=600?'?receipt='+encodeURIComponent(receipt):'')
 }catch{return null}
}
