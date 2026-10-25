import {PrivyClient} from '@privy-io/server-auth'
import {getAddress} from 'viem'
import {readCircleLink,circleLinkKey} from '../privy-circle-link.js'

export async function solanaBridgeWallets(owner:string,destination:string){
 const from=await readCircleLink(circleLinkKey(owner,'solana','payment'))
 if(destination==='bsc'||destination==='xlayer'){
  const user=await new PrivyClient(process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID||'',process.env.PRIVY_APP_SECRET||'').getUserById(owner)
  const wallets=user.linkedAccounts.filter(a=>a.type==='wallet'&&a.walletClientType==='privy'&&a.chainType==='ethereum') as Array<{address:string}>
  if(!from||wallets.length!==1)throw Error('Open your source and destination wallets before bridging.')
  return {from,to:{circleWalletAddress:getAddress(wallets[0].address)}}
 }
 const to=await readCircleLink(circleLinkKey(owner,destination,'payment'))
 if(!from||!to)throw Error('Open both Pocket wallets before bridging.')
 return {from,to}
}
