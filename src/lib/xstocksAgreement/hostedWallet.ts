import { pocketEmbeddedAddresses } from '../../pocket/lib/pocketEmbeddedWallet'

export function selectHostedWallet<T extends {address:string;walletClientType:string}>(authenticated:boolean,user:unknown,wallets:T[]):T|undefined {
  if(!authenticated)return undefined
  const linked=pocketEmbeddedAddresses(user)
  const embedded=wallets.filter(wallet=>wallet.walletClientType==='privy')
  return linked.length===1&&embedded.length===1&&linked[0].toLowerCase()===embedded[0].address.toLowerCase()?embedded[0]:undefined
}
