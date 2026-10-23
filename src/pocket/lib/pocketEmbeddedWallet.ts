import { getAddress, isAddress } from 'viem'

export function pocketEmbeddedAddresses(user:unknown):string[] {
 const accounts=(user as {linkedAccounts?:unknown})?.linkedAccounts
 if(!Array.isArray(accounts))return []
 return [...new Set(accounts.filter(a=>a?.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy'&&typeof a.address==='string'&&isAddress(a.address)).map(a=>getAddress(a.address)))]
}
// Share one creation across Pocket and XStocks mounts. Never create another
// wallet merely because the signing iframe is still connecting.
const creations=new Map<string,Promise<string>>()
export function ensurePocketEmbeddedWallet(owner:string,create:()=>Promise<{address:string}>):Promise<string> {
 if(!owner)return Promise.reject(Error('Sign in to open your XStocks wallet.'))
 const existing=creations.get(owner)
 if(existing)return existing
 const work=Promise.resolve().then(create).then(wallet=>{
  if(!isAddress(wallet.address))throw Error('Wallet address is unavailable.')
  return getAddress(wallet.address)
 })
 creations.set(owner,work)
 // A failed attempt is retained until an explicit retry; concurrent mounts never
 // retry creation on their own. Successful creation stays reusable until reload.
 void work.catch(()=>undefined)
 return work
}
export async function retryPocketEmbeddedWallet(owner:string,create:()=>Promise<{address:string}>):Promise<string> {
 const existing=creations.get(owner)
 if(existing){try{return await existing}catch{if(creations.get(owner)===existing)creations.delete(owner)}}
 return ensurePocketEmbeddedWallet(owner,create)
}
