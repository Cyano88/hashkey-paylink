import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useAuthorizationSignature} from '@privy-io/react-auth'
import PocketAmountKeypad from './PocketAmountKeypad'
import PocketSelect from './PocketSelect'
import PocketSlideAction from './PocketSlideAction'
import {crossBridgeAssets,type CrossBridgeNetwork} from '../lib/pocketCrossBridgeAssets'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {beginPocketOperation,endPocketOperation,trackPocketOperation} from '../lib/pocketOperationRecovery'
import {takePocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import {executeCircleSolanaEmailChallenge,type SolanaEmailSession} from '../../lib/circleSolanaEmailWallet'
import type {PocketNetwork} from '../lib/pocketSchemas'

const sourceNetworks:CrossBridgeNetwork[]=['celo','solana','bsc','xlayer','ethereum','arbitrum','polygon','arc']
const labels:Record<CrossBridgeNetwork,string>={celo:'Celo',bsc:'BNB Chain',xlayer:'X Layer',ethereum:'Ethereum',arbitrum:'Arbitrum',polygon:'Polygon',arc:'Arc',base:'Base',solana:'Solana'}
const privyNetworks=new Set<CrossBridgeNetwork>(['celo','bsc','xlayer'])
type Quote={id:string;rail:'cross';execution:'privy'|'circle';provider:'relay'|'lifi';providerFee?:string;nativeFee?:string;nativeFeeAsset?:'CELO';selectionKey:string;source:CrossBridgeNetwork;destination:'base';destinationAddress:string;asset:string;destinationAsset:'USDC';amount:string;receive:string;minimumReceive:string;fee:string;total:string;expiresAt:number;purpose:'cash'}
type Review={quote:Quote;quoteToken:string}
type Props={owner:string;privyAddress?:string;getAccessToken():Promise<string|null>;ensureWallet(network:PocketNetwork):Promise<{address:string}|null>;getSession(network:Exclude<PocketNetwork,'solana'>,address:string):Promise<CircleEvmEmailSession>;getSolanaSession(address:string):Promise<SolanaEmailSession>;onBusyChange(value:boolean):void;onTracked(id:string,asset:string):void;refresh():Promise<unknown>}
const cleanAmount=(value:string)=>/^\d{1,20}(?:\.\d{1,18})?$/.test(value)&&Number(value)>0

async function request(path:string,body:Record<string,unknown>,getAccessToken:Props['getAccessToken'],approval?:string){
 const token=await getAccessToken();if(!token)throw Error('Sign in again to continue.')
 const response=await fetch(pocketApiUrl(path),{method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json',...(approval?{'x-pocket-payment-approval':approval}:{})},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)})
 const result=await response.json();if(!response.ok||result?.ok===false)throw Error(typeof result?.error==='string'?result.error:'Cash funding is temporarily unavailable.')
 return result
}

export default function PocketCashFundingPanel(p:Props){
 const [network,setNetwork]=useState<CrossBridgeNetwork>('celo'),[asset,setAsset]=useState('USDT'),[amount,setAmount]=useState(''),[review,setReview]=useState<Review|null>(null),[session,setSession]=useState<CircleEvmEmailSession|SolanaEmailSession|null>(null)
 const [enabled,setEnabled]=useState<boolean|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[phase,setPhase]=useState<'edit'|'review'>('edit')
 const {generateAuthorizationSignature}=useAuthorizationSignature(),lock=useRef(false),mounted=useRef(true),version=useRef(0),ownerRef=useRef(p.owner);ownerRef.current=p.owner
 const assets=useMemo(()=>crossBridgeAssets(network).map(item=>item.symbol),[network])
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;version.current++}},[])
 useEffect(()=>{setAsset(current=>assets.includes(current)?current:assets[0]||'USDC');setReview(null);setSession(null);setError('');setPhase('edit')},[network,assets])
 useEffect(()=>{
  let stopped=false
  void (async()=>{try{const token=await p.getAccessToken();if(!token)throw Error();const response=await fetch(pocketApiUrl('/api/pocket/cross-bridge'),{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok||data?.ok!==true)throw Error();if(!stopped)setEnabled(data.enabled===true)}catch{if(!stopped)setEnabled(false)}})()
  return()=>{stopped=true}
 },[p.owner,p.getAccessToken])
 useEffect(()=>{p.onBusyChange(busy);return()=>p.onBusyChange(false)},[busy,p.onBusyChange])
 const pickNetwork=(value:string)=>{version.current++;setNetwork(value as CrossBridgeNetwork);setReview(null);setSession(null);setPhase('edit');setError('')}
 const chooseQuote=useCallback(async()=>{
  if(!cleanAmount(amount)||!assets.includes(asset)||!enabled||loading||busy)return
  const requestVersion=++version.current,owner=p.owner;setLoading(true);setError('');setReview(null);setSession(null)
  try{
   let circleUserToken:string|undefined
   if(network==='solana'){
    const source=await p.ensureWallet('solana');if(!source)throw Error('Open your Solana wallet to continue.')
    const active=await p.getSolanaSession(source.address);circleUserToken=active.userToken;setSession(active)
   }else if(!privyNetworks.has(network)){
    const source=await p.ensureWallet(network as PocketNetwork);if(!source)throw Error('Open your '+labels[network]+' wallet to continue.')
    const active=await p.getSession(network as Exclude<PocketNetwork,'solana'>,source.address);circleUserToken=active.userToken;setSession(active)
   }else if(!p.privyAddress)throw Error('Your Pocket wallet is reconnecting.')
   const destination=await p.ensureWallet('base');if(!destination)throw Error('Open your Base wallet to continue.')
   if(!mounted.current||ownerRef.current!==owner||version.current!==requestVersion)return
   const result=await request('/api/pocket/cross-bridge',{action:'quote',purpose:'cash',source:network,destination:'base',from:asset,to:'USDC',amount,circleUserToken},p.getAccessToken)
   const q=result?.quote as Quote,token=result?.quoteToken
   if(!q||q.purpose!=='cash'||q.source!==network||q.destination!=='base'||q.asset!==asset||q.destinationAsset!=='USDC'||!['relay','lifi'].includes(q.provider)||q.provider==='lifi'&&(network!=='celo'||asset!=='cNGN'||!q.nativeFee||q.nativeFeeAsset!=='CELO'||!q.providerFee)||q.execution!==(privyNetworks.has(network)?'privy':'circle')||q.expiresAt<=Date.now()||typeof token!=='string'||!token)throw Error('The quote changed. Review it again.')
   if(!mounted.current||ownerRef.current!==owner||version.current!==requestVersion)return
   setReview({quote:q,quoteToken:token});setPhase('review')
  }catch(e){if(mounted.current&&ownerRef.current===owner&&version.current===requestVersion)setError((e as Error).message||'Could not get a cash funding quote.')}
  finally{if(mounted.current&&ownerRef.current===owner&&version.current===requestVersion)setLoading(false)}
 },[amount,asset,assets,enabled,loading,busy,network,p.owner,p.privyAddress,p.ensureWallet,p.getSession,p.getSolanaSession,p.getAccessToken])
 async function submit(){
  const saved=review,owner=p.owner
  if(lock.current||!saved||saved.quote.expiresAt<=Date.now()||!enabled)return
  lock.current=true;setBusy(true);setError('');beginPocketOperation(owner,saved.quote.id)
  try{
   const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm with your PIN or fingerprint.')
   const circleUserToken=session?.userToken
   const prepared=await request('/api/pocket/cross-bridge',{action:'prepare',quoteToken:saved.quoteToken,circleUserToken},p.getAccessToken,approval.token)
   if(ownerRef.current!==owner)throw Error('Your Pocket account changed.')
   const local={quote:saved.quote,quoteToken:saved.quoteToken,...(prepared.challengeId?{challengeId:prepared.challengeId}:{})}
   trackPocketOperation(owner,'bridge',local,'processing')
   if(saved.quote.execution==='privy'){
    if(!prepared.request)throw Error('Wallet approval details are unavailable.')
    const signed=await generateAuthorizationSignature(prepared.request)
    if(ownerRef.current!==owner)throw Error('Your Pocket account changed.')
    const result=await request('/api/pocket/cross-bridge',{action:'submit',quoteToken:saved.quoteToken,authorization:signed.signature},p.getAccessToken)
    trackPocketOperation(owner,'bridge',{...local,...(result.txHash?{txHash:result.txHash}:{}),...(result.challengeId?{challengeId:result.challengeId}:{})},'processing')
   }else if(saved.quote.source==='solana'){
    if(!session||!('encryptionKey' in session)||typeof prepared.transaction!=='string'||!prepared.transaction)throw Error('Solana approval details are unavailable.')
    const submitted=await request('/api/pocket/cross-bridge',{action:'submit',quoteToken:saved.quoteToken,circleUserToken},p.getAccessToken)
    if(!submitted.challengeId)throw Error('Wallet approval is unavailable. Your quote remains saved.')
    trackPocketOperation(owner,'bridge',{...local,challengeId:submitted.challengeId},'processing')
    const signedTransaction=await executeCircleSolanaEmailChallenge({session:session as SolanaEmailSession,challengeId:submitted.challengeId,approval:{asset:saved.quote.asset as 'SOL'|'USDC'|'USDT',amount:saved.quote.amount,totalAmount:saved.quote.total,destinationAddress:saved.quote.destinationAddress||''}})
    if(ownerRef.current!==owner)throw Error('Your Pocket account changed.')
    trackPocketOperation(owner,'bridge',{...local,challengeId:submitted.challengeId,signedTransaction},'processing')
    const result=await request('/api/pocket/cross-bridge',{action:'signed',quoteToken:saved.quoteToken,signedTransaction},p.getAccessToken)
    trackPocketOperation(owner,'bridge',{...local,challengeId:submitted.challengeId,signedTransaction,...(result.txHash?{txHash:result.txHash}:{})},'processing')
   }else{
    if(!session)throw Error('Reconnect your wallet and review the quote again.')
    const result=await request('/api/pocket/cross-bridge',{action:'submit',quoteToken:saved.quoteToken,circleUserToken},p.getAccessToken)
    if(!result.challengeId)throw Error('Wallet approval is unavailable. Your quote remains saved.')
    trackPocketOperation(owner,'bridge',{...local,challengeId:result.challengeId},'processing')
    const signed=await executeCircleEvmEmailChallenge({session:session as CircleEvmEmailSession,challengeId:result.challengeId,pendingMessage:'Your cash funding is saved. Pocket will update its status automatically.'})
    trackPocketOperation(owner,'bridge',{...local,challengeId:result.challengeId,...(signed.transactionHash?{txHash:signed.transactionHash}:{})},'processing')
   }
   if(ownerRef.current!==owner)throw Error('Your Pocket account changed.')
   setAmount('');setPhase('edit');setReview(null);await p.refresh();p.onTracked(saved.quote.id,saved.quote.asset)
  }catch(e){setError((e as Error).message||'Cash funding could not be started.')}
  finally{endPocketOperation(owner,saved.quote.id);lock.current=false;if(mounted.current)setBusy(false)}
 }
 const available=assets.includes(asset),networkOptions=sourceNetworks.map(value=>({value,label:labels[value]})),assetOptions=assets.map(value=>({value,label:value}))
 if(enabled===null)return <div role="status" aria-label="Checking cash funding" className="h-14 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10" />
 if(!enabled)return <p role="status" className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">Cash funding from another network is not available for this account yet.</p>
 return <section className="flex min-h-0 flex-1 flex-col gap-4">
  {phase==='edit'?<>
   <div className="space-y-3">
    <div><p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Pay from</p><PocketSelect value={network} options={networkOptions} disabled={loading||busy} showNetworkBalances={false} ariaLabel="Source network" onChange={pickNetwork}/></div>
    <div><p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Asset</p><PocketSelect value={asset} options={assetOptions} disabled={loading||busy||!assets.length} showNetworkBalances={false} ariaLabel="Source asset" onChange={value=>{setAsset(value);setReview(null);setError('')}}/></div>
   </div>
   <div className="flex flex-1 flex-col items-center justify-center py-2">
    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Amount</p>
    <div className="mt-2 flex items-baseline gap-2"><input inputMode="none" aria-label={'Amount in '+asset} value={amount} readOnly onKeyDown={event=>{if(event.key==='Backspace')setAmount(value=>value.slice(0,-1));else if(/^[0-9.]$/.test(event.key))setAmount(value=>value.includes('.')&&event.key==='.'?value:value+event.key)}} className="w-full max-w-[240px] bg-transparent text-center text-4xl font-semibold tabular-nums tracking-tight outline-none" placeholder="0.00"/><span className="text-sm font-semibold text-gray-500">{asset}</span></div>
   </div>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
   <div className="mt-auto space-y-2"><PocketSlideAction approvalRequired={false} loadingContent={loading} status={loading?'pending':'idle'} disabled={!cleanAmount(amount)||!available||busy||loading} onConfirm={()=>void chooseQuote()} labels={{idle:'Review amount',disabled:loading?'Updating quote':'Enter amount',pending:'Getting quote',submitted:'Getting quote',successful:'Quote ready'}}/><PocketAmountKeypad value={amount} decimals={Math.min(18,crossBridgeAssets(network).find(a=>a.symbol===asset)?.decimals||6)} disabled={loading||busy} onChange={value=>{setAmount(value);setError('')}}/></div>
  </>:<>
   <button type="button" disabled={busy} onClick={()=>{version.current++;setPhase('edit');setReview(null);setError('')}} className="self-start text-sm font-medium text-gray-500">Back</button>
   <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
    <p className="text-xs text-gray-500 dark:text-gray-400">Cash balance receives</p><p className="mt-1 text-2xl font-semibold tabular-nums">USDC {review?.quote.receive}</p>
    <div className="mt-4 space-y-3 text-sm">
     <div className="flex justify-between gap-3"><span className="text-gray-500">Amount sent</span><span className="font-medium">{review?.quote.amount} {asset} on {labels[network]}</span></div>
     {review?.quote.provider==='lifi'&&<><div className="flex justify-between gap-3"><span className="text-gray-500">Jumper fee (deducted from amount)</span><span className="font-medium">{review.quote.providerFee} {asset}</span></div><div className="flex justify-between gap-3"><span className="text-gray-500">Additional CELO required</span><span className="font-medium">{review.quote.nativeFee} CELO</span></div></>}
     <div className="flex justify-between gap-3"><span className="text-gray-500">Pocket fee</span><span className="font-medium">{review?.quote.fee} {asset}</span></div>
     <div className="flex justify-between gap-3 border-t border-gray-200 pt-3 font-semibold dark:border-white/10"><span>Total {asset} debit</span><span>{review?.quote.total} {asset}</span></div>
     <div className="flex justify-between gap-3"><span className="text-gray-500">Minimum received</span><span className="font-medium">USDC {review?.quote.minimumReceive}</span></div>
    </div>
   </div>
   <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{review?.quote.provider==='lifi'?'CELO is taken separately from your Celo wallet. ':''}Your Cash balance updates after the transfer reaches Base and is verified.</p>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
   <div className="mt-auto"><PocketSlideAction approvalRequired onPrepare={async()=>{if(!review||review.quote.expiresAt<=Date.now())throw Error('The quote expired. Review it again.')}} status={busy?'pending':'idle'} disabled={!review||busy||review.quote.expiresAt<=Date.now()} onConfirm={()=>void submit()} labels={{idle:'Add to Cash balance',disabled:'Quote expired',pending:'Confirming',submitted:'Adding cash',successful:'Cash added'}}/></div>
  </>}
 </section>
}
