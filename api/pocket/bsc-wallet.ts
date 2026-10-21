import {PrivyClient} from '@privy-io/server-auth'
import {getAddress,isAddress} from 'viem'

export function bscLinkedWallet(user:{linkedAccounts:any[]}) {
 const accounts=user.linkedAccounts.filter(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy')
 if(!accounts.length)return null
 if(accounts.length!==1||!isAddress(accounts[0].address)||typeof accounts[0].id!=='string')throw Error('BNB wallet binding unavailable.')
 return {address:getAddress(accounts[0].address),id:accounts[0].id as string}
}
const cached=new Map<string,{until:number;wallet:ReturnType<typeof bscLinkedWallet>}>()
export async function readBscWallet(owner:string){
 const hit=cached.get(owner);if(hit&&hit.until>Date.now())return hit.wallet
 const app=process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID,secret=process.env.PRIVY_APP_SECRET
 if(!app||!secret)throw Error('BNB wallet unavailable.')
 const wallet=bscLinkedWallet(await new PrivyClient(app,secret).getUserById(owner))
 if(cached.size>=256)cached.delete(cached.keys().next().value!)
 cached.set(owner,{until:Date.now()+30000,wallet});return wallet
}
