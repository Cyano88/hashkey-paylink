const allowed=new Set(['/home','/activity','/notifications','/activity/collections','/xstocks/request','/xstocks/home','/xstocks/activity','/xstocks/notifications'])
export function pocketNotificationPath(value:unknown):string|null {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return null
 try{const url=new URL(value,'https://pocket.invalid');if(url.origin!=='https://pocket.invalid'||!allowed.has(url.pathname))return null
 if(url.pathname==='/activity/collections')return url.searchParams.get('kind')==='requests'?'/activity/collections?kind=requests':null
 const receipt=url.searchParams.get('receipt');return url.pathname+(receipt&&receipt.length<=600?'?receipt='+encodeURIComponent(receipt):'')
 }catch{return null}
}
