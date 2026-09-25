import {useCallback,useEffect,useRef,useState} from 'react'
import {useParams} from 'react-router-dom'
import {usePrivy} from '@privy-io/react-auth'
import {PRIVY_APP_ID} from '../lib/authMode'
import {HashPayLinkCheckoutBrand,CheckoutTrustLine} from '../components/CheckoutChrome'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import PocketArcSwapPanel from '../pocket/components/PocketArcSwapPanel'
import PocketStockTrade from '../pocket/components/PocketStockTrade'
import PocketPaymentSecurityGate from '../pocket/components/PocketPaymentSecurityGate'
import usePocketIdentity from '../pocket/hooks/usePocketIdentity'
import usePocketStockWallet from '../pocket/hooks/usePocketStockWallet'
import usePocketWalletController from '../pocket/controllers/usePocketWalletController'
import type {stockSwapRequest} from '../pocket/api/pocketStockSwapClient'
type Session={id:string;projectName:string;walletAppId:string;rail:'arc'|'xlayer';chainId:5042|196}
export default function WalletSwapPage(){
 const {sessionId=''}=useParams(),{ready,authenticated,user}=usePrivy()
 if(!/^wss_[a-f0-9]{64}$/.test(sessionId))return <p role='alert'>Invalid swap link.</p>
 return <section className='mx-auto w-full max-w-md'><HashPayLinkCheckoutBrand/>
 {!ready?<p role='status' className='p-5 text-sm'>Opening wallet...</p>:!authenticated?<div className='rounded-3xl border p-5'><h1 className='mb-4 text-lg font-bold'>Sign in to swap</h1><PocketEmailLogin context='agreement'/></div>:<ConnectedSwap key={user?.id+':'+sessionId} sessionId={sessionId}/>}
 <CheckoutTrustLine provider='hashpaylink'/></section>
}
function ConnectedSwap({sessionId}:{sessionId:string}){
 const {getAccessToken,email}=usePocketIdentity(),[session,setSession]=useState<Session>(),[error,setError]=useState(''),[enabled,setEnabled]=useState(false),[retry,setRetry]=useState(0)
 const alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const call=useCallback(async(payload:Record<string,unknown>,signal?:AbortSignal)=>{
  let timer:ReturnType<typeof setTimeout>|undefined
  const token=await Promise.race([getAccessToken(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Your session took too long. Try again.')),15000)})]).finally(()=>clearTimeout(timer));if(!alive.current)throw Error('Your wallet account changed.');if(!token)throw Error('Sign in again to continue.')
  const response=await fetch('/api/v2/wallets/swap-sessions/participant',{method:'POST',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({sessionId,...payload})})
  const data=await response.json().catch(()=>{throw Error('Swap service could not load. Try again.')})
  if(!alive.current)throw Error('Your wallet account changed.')
  if(!response.ok||!data.ok)throw Error(data.error||'Swap request failed.')
  return data
 },[sessionId,getAccessToken])
 useEffect(()=>{const controller=new AbortController();void call({action:'read'},controller.signal).then(data=>{if(controller.signal.aborted)return;if(data.session?.id!==sessionId||data.session.walletAppId!==PRIVY_APP_ID||!['arc','xlayer'].includes(data.session.rail)||data.session.chainId!==(data.session.rail==='arc'?5042:196))throw Error('Wallet session configuration changed.');setSession(data.session);setEnabled(data.enabled);setError('')}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[call,retry,sessionId])
 const request=useCallback((body?:Record<string,unknown>,token?:string)=>call({action:'request',method:body?'POST':'GET',payload:body||{},token}),[call])
 const stockRequest=useCallback<typeof stockSwapRequest>((_getToken,body)=>request(body),[request])
 return <>
 {session?<><h1 className='my-4 text-center text-lg font-bold'>{session.rail==='arc'?'Swap on Arc':'Swap xStocks'}</h1><p className='mb-4 text-center text-xs text-gray-500'>{session.projectName} &middot; Your Hash PayLink wallet</p>
 {!enabled&&<p role='status' className='mb-4 text-xs text-gray-500'>New swaps are paused. Existing transaction recovery remains available.</p>}
 {session.rail==='arc'?<ArcSwap request={request} scope={session.id}/>:<PocketPaymentSecurityGate email={email} getAccessToken={getAccessToken}><StockSwap request={stockRequest}/></PocketPaymentSecurityGate>}
 </>:!error&&<div className='h-40 animate-pulse rounded-3xl bg-gray-100 dark:bg-white/5' role='status' aria-label='Loading swap'/>}
 {error&&<div role='alert' className='mt-4 text-sm text-red-600'>{error}<button className='block min-h-11 underline' onClick={()=>setRetry(n=>n+1)}>Try again</button></div>}
 </>
}
function ArcSwap({request,scope}:{request:(body?:Record<string,unknown>,token?:string)=>Promise<any>;scope:string}){
 const identity=usePocketIdentity(),controller=usePocketWalletController(identity)
 const refresh=useCallback(async()=>{},[])
 return <PocketArcSwapPanel email={identity.email} getAccessToken={identity.getAccessToken} request={request} storageScope={scope} ensureWallet={()=>controller.ensureWallet('arc')} getSession={address=>controller.getEvmSession('arc',address)} refresh={refresh}/>
}
function StockSwap({request}:{request:typeof stockSwapRequest}){
 const wallet=usePocketStockWallet({swapRequest:request})
 return <PocketStockTrade wallet={wallet} initialMode='swap' swapRequest={request}/>
}
