import type {CircleEvmEmailSession} from './circleEvmEmailWallet'
import type {CirclePocketWallet} from '../pocket/models/pocketWallet'

// Browser authentication must not depend on the native secure credential store.
// Only a missing session prompts verification; network failures remain retryable.
export async function prepareBrowserWalletSession(p:{
  chain:CircleEvmEmailSession['chain'];email:string;wallet:CirclePocketWallet;
  getAccessToken:()=>Promise<string|null>;active:()=>boolean;
  restore:()=>Promise<CircleEvmEmailSession>;
}, deps={connect:async(email:string,chain:'base'|'arbitrum'|'arc')=>(await import('./circleEvmEmailWallet')).connectCircleEvmEmailWallet(email,chain),resolve:async(s:CircleEvmEmailSession,token:string)=>(await import('./circleEvmEmailWallet')).restoreActivatedCircleEvmSession(s,token)}) {
  const check=()=>{if(!p.active())throw Error('Your account changed. Sign in again.')}
  const blockchain={base:'BASE',arbitrum:'ARB',arc:'ARC',ethereum:'ETH',polygon:'MATIC'}[p.chain]
  const matches=(s:CircleEvmEmailSession)=>s.chain===p.chain&&s.wallet.blockchain===blockchain&&s.wallet.address.toLowerCase()===p.wallet.address.toLowerCase()&&(!p.wallet.walletId||s.wallet.id===p.wallet.walletId)
  check()
  let session:CircleEvmEmailSession
  try {session=await p.restore()}
  catch(e) {
    if(!(e instanceof Error)||e.name!=='PocketWalletSessionRecoveryRequiredError')throw e
    check()
    session=await deps.connect(p.email,p.chain==='ethereum'||p.chain==='polygon'?'base':p.chain)
  }
  check()
  if(!matches(session)) {
    const token=await p.getAccessToken();check()
    if(!token)throw Error('Sign in again to continue.')
    const resolved=await deps.resolve(session,token);check()
    const selected=resolved.chain===p.chain?resolved.wallet:p.chain==='arc'?resolved.arcMainnetWallet:p.chain==='base'||p.chain==='arbitrum'?resolved.productionEvmTopology?.wallets?.[p.chain]:resolved.additionalWallets?.[p.chain]
    const matching=selected?{...resolved,chain:p.chain,wallet:selected}:null
    if(!matching||!matches(matching))throw Error('This wallet does not match your account. Sign in with the correct email.')
    session=matching
  }
  return session
}
