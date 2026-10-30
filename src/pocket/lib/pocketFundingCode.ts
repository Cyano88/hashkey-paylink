import {pocketWalletAddressCode} from './pocketWalletAddressCode'
export type PocketFundingCode={recipient:string;network:string;asset:'USDC'|'USDT';path:string}
const networks=['base','arbitrum','ethereum','polygon','solana','arc','xlayer','bsc']
const hosts=['pocket.hashpaylink.com','app.hashpaylink.com']
export function pocketFundingCode(recipient:string,network:string,asset:string):string{
 if(!networks.includes(network)||!['USDC','USDT'].includes(asset)||network==='arc'&&asset!=='USDC')throw Error('This funding asset or network is not supported.')
 const address=pocketWalletAddressCode(recipient,network)
 return 'https://pocket.hashpaylink.com/home/send?'+new URLSearchParams({mode:'address',recipient:address,network,asset})
}
export function parsePocketFundingCode(raw:string):PocketFundingCode|null{
 if(raw.length>4096)throw Error('This QR is too long.')
 let url:URL;try{url=new URL(raw.trim())}catch{return null}
 if(!hosts.includes(url.hostname)||!['/home/send','/pocket/home/send'].includes(url.pathname))return null
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)throw Error('This funding QR is invalid.')
 const keys=[...url.searchParams.keys()]
 if(keys.length!==4||new Set(keys).size!==4||keys.some(k=>!['mode','recipient','network','asset'].includes(k))||url.searchParams.get('mode')!=='address')throw Error('This funding QR has incomplete or conflicting details.')
 const recipient=url.searchParams.get('recipient')||'',network=url.searchParams.get('network')||'',asset=url.searchParams.get('asset')||''
 const canonical=new URL(pocketFundingCode(recipient,network,asset))
 return {recipient:canonical.searchParams.get('recipient')!,network,asset:asset as 'USDC'|'USDT',path:canonical.pathname+canonical.search}
}
