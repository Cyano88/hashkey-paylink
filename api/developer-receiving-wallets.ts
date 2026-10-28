import {isAddress, getAddress} from 'viem'
import {circleLinkKey, readCircleLink, type CircleLinkRecord} from './privy-circle-link.js'
import {readBscWallet} from './pocket/bsc-wallet.js'
import {POCKET_NETWORKS} from '../src/pocket/lib/pocketSchemas.js'

// Only owner-bound wallets are suggested. Never infer a Circle address on another chain.
export async function developerReceivingWallets(owner: string, deps = {readLink:readCircleLink, readEmbedded:readBscWallet}) {
 const entries = await Promise.allSettled(POCKET_NETWORKS.map(async network => {
  const link:CircleLinkRecord|null = await deps.readLink(circleLinkKey(owner, network, 'payment'))
  if (!link || link.privyUserId !== owner || link.chain !== network || (link.purpose ?? 'payment') !== 'payment') return null
  const address=link.circleWalletAddress
  if(network === 'solana' ? !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) : !isAddress(address) || /^0x0{40}$/i.test(address)) return null
  return [network,network === 'solana' ? address : getAddress(address)] as const
 }))
 const wallets:Record<string,string>={}
 for(const entry of entries)if(entry.status === 'fulfilled' && entry.value)wallets[entry.value[0]]=entry.value[1]
 // Pocket uses the same Privy embedded EOA for BNB and X Layer, unlike Circle SCAs.
 try {const embedded=await deps.readEmbedded(owner); if(embedded && isAddress(embedded.address) && !/^0x0{40}$/i.test(embedded.address)){wallets.bsc=getAddress(embedded.address);wallets.xlayer=getAddress(embedded.address)}} catch {}
 return wallets
}
