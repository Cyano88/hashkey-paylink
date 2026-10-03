import type {CircleEvmEmailSession} from './circleEvmEmailWallet'
import {readPocketWallet,linkPocketWallet} from '../pocket/api/pocketWalletLinkClient'

const defaults={read:readPocketWallet,restore:async(session:CircleEvmEmailSession,token:string)=>(await import('./circleEvmEmailWallet')).restoreActivatedCircleEvmSession(session,token),link:linkPocketWallet}
export async function resolveArcTradeWalletSession(session:CircleEvmEmailSession,accessToken:string,active:()=>boolean=()=>true,deps=defaults){
 const check=()=>{if(!active())throw Error('Wallet connection was closed.')}
 check()
 const linked=await deps.read({accessToken,network:'arc'})
 const matches=(wallet:typeof session.wallet)=>wallet.blockchain==='ARC'&&(!linked||(wallet.id===linked.wallet.id&&wallet.address.toLowerCase()===linked.wallet.address.toLowerCase()))
 let resolved=session
 if(linked&&!matches(resolved.wallet))resolved=await deps.restore(session,accessToken)
 check()
 if(resolved.chain!=='arc'||!matches(resolved.wallet))throw Error('The Circle session does not match your linked Arc wallet. No wallet link was changed.')
 if(!linked)await deps.link({accessToken,network:'arc',circleUserToken:resolved.userToken,wallet:resolved.wallet})
 check()
 const confirmed=await deps.read({accessToken,network:'arc'})
 if(!confirmed||confirmed.wallet.id!==resolved.wallet.id||confirmed.wallet.address.toLowerCase()!==resolved.wallet.address.toLowerCase())throw Error('Your linked Arc wallet changed. Refresh before continuing.')
 return resolved
}
