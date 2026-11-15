import {createHash} from 'node:crypto'
import {mutateDurableJson} from './render-durable-store.js'

/** One signed quote must never authorize multiple blockhash-distinct transfers. */
export async function rememberQrSolanaBuild<T extends {tx:string;lastValidBlockHeight:number}>(owner:string,quoteId:string,result:T):Promise<T>{
 const key='hashpaylink:qr-solana-build:v1:'+createHash('sha256').update(JSON.stringify([owner,quoteId])).digest('hex')
 return mutateDurableJson<T>(key,current=>current??result)
}
