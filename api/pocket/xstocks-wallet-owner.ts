import { PrivyClient } from '@privy-io/server-auth'
import { isAddress } from 'viem'
const verified=new Map<string,{until:number;work:Promise<void>}>()
export async function verifyStockWalletOwner(owner:string,wallet:string){
 if(!isAddress(wallet))throw Object.assign(Error('Invalid stock wallet.'),{status:400})
 const key=owner+':'+wallet.toLowerCase(),cached=verified.get(key)
 if(cached&&cached.until>Date.now())return cached.work
 const work=(async()=>{const privy=new PrivyClient((process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID)!,process.env.PRIVY_APP_SECRET!),user=await privy.getUserById(owner);if(!user.linkedAccounts.some(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy'&&a.address.toLowerCase()===wallet.toLowerCase()))throw Object.assign(Error('This is not your embedded stock wallet.'),{status:403})})().catch(e=>{verified.delete(key);throw e})
 verified.set(key,{until:Date.now()+120000,work});if(verified.size>500)for(const [k,v]of verified)if(v.until<Date.now())verified.delete(k)
 return work
}
