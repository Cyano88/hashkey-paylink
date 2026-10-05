import {useCallback,useEffect,useRef,useState} from 'react'
import {useParams,useSearchParams} from 'react-router-dom'
import {usePrivy} from '@privy-io/react-auth'
import {formatUnits,parseUnits} from 'viem'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import {CheckoutTrustLine,HashPayLinkCheckoutBrand} from '../components/CheckoutChrome'
import {connectCircleEvmEmailWallet,executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../lib/circleEvmEmailWallet'
import {resolveArcTradeWalletSession} from '../lib/arcTradeWalletSession'
import {clearArcTradeSession,restoreArcTradeSession,saveArcTradeSession} from '../lib/arcTradeSessionPersistence'
import {boundedCheckoutRequest} from '../lib/xstocksAgreement/boundedRequest'
import {tradeReturnUrl} from '../lib/xstocksAgreement/tradeReturn'
import {TRADE_ACTION_LABELS,type TradeXLayerAction} from '../lib/xstocksAgreement/protocol'
import {PRIVY_APP_ID} from '../lib/authMode'
import type {ArcHostedTrade} from '../../api/trade-agreement/arc-http'
import type {ArcTradeStatus} from '../../api/trade-agreement/arc-planner'
import ArcTradeReceiptCard from '../components/ArcTradeReceiptCard'

type Execution={requestId:string;operation:TradeXLayerAction;status:'reserved'|'challenge_issued'|'submitted'|'confirmed'|'reverted';own:boolean;challengeId?:string;transactionHash?:string}
type Reply={ok:true;role:'customer'|'provider';fundingEnabled:boolean;agreement:ArcHostedTrade & {consentHash:string};status?:ArcTradeStatus;execution?:Execution;pending?:boolean}
const button='min-h-11 w-full rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950'
const secondary='min-h-11 w-full rounded-full border border-gray-200 px-4 py-3 text-sm font-semibold disabled:opacity-40 dark:border-white/15'
const input='w-full rounded-xl border border-gray-200 bg-transparent p-3 text-sm dark:border-white/15'
const states=['Awaiting seller confirmation','Awaiting payment','Payment held','Dispatched','Inspection period','In dispute','Payment released','Refunded','Resolved','Cancelled']
const terminal=(execution?:Execution)=>execution?.status==='confirmed'||execution?.status==='reverted'
function Skeleton(){return <div className='mt-5 space-y-4' role='status' aria-label='Loading Trade agreement'><div className='h-7 w-3/4 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10'/><div className='h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/10'/><div className='h-11 animate-pulse rounded-full bg-gray-100 dark:bg-white/10'/></div>}
export default function ArcTradeAgreementPage(){
  const {agreementId=''}=useParams(),{ready,authenticated,user,logout}=usePrivy(),[params]=useSearchParams()
  if(!/^tag_[a-f0-9]{64}$/.test(agreementId))return <p role='alert'>This Trade agreement link is invalid.</p>
  return <section className='mx-auto w-full max-w-md'>
    <HashPayLinkCheckoutBrand/>
    <div className='rounded-[1.35rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101114] sm:p-6'>
      <p className='text-xs font-semibold text-gray-500'>Trade agreement · USDC on Arc</p>
      {!ready?<Skeleton/>:!authenticated?<><h1 className='mt-3 text-xl font-semibold'>Review your Trade agreement</h1><p className='mb-5 mt-2 text-sm text-gray-500'>Sign in to Hash PayLink to continue.</p><PocketEmailLogin context='agreement'/></>:<Connected key={`${user?.id}:${agreementId}`} agreementId={agreementId} returnTo={tradeReturnUrl(params.get('returnTo'))}/>}
    </div>
    <CheckoutTrustLine provider='hashpaylink'/>
    {authenticated&&<button type='button' className='mx-auto mt-3 block min-h-11 text-xs text-gray-500 underline' onClick={()=>{if(user?.id&&user.email?.address)clearArcTradeSession({userId:user.id,email:user.email.address,walletAppId:PRIVY_APP_ID});void logout()}}>Switch account</button>}
  </section>
}
function Connected({agreementId,returnTo}:{agreementId:string;returnTo?:string}){
  const {user,getAccessToken}=usePrivy()
  const [reply,setReply]=useState<Reply>(),[session,setSession]=useState<CircleEvmEmailSession>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [selected,setSelected]=useState<TradeXLayerAction>(),[note,setNote]=useState(''),[buyerAmount,setBuyerAmount]=useState('')
  const [reviewedSettlement,setReviewedSettlement]=useState<ArcTradeStatus['settlement']>()
  const [checking,setChecking]=useState(false),[walletOpen,setWalletOpen]=useState(false),[attention,setAttention]=useState<'resume'|'retry'>()
  const [restoring,setRestoring]=useState(true),[restoreFailed,setRestoreFailed]=useState(false),[restoreAttempt,setRestoreAttempt]=useState(0)
  const snapshot=useRef({reply,session,selected});snapshot.current={reply,session,selected}
  const lifetime=useRef(new AbortController()),locked=useRef(false),retryAction=useRef<{requestId:string;operation:TradeXLayerAction}>()
  const post=useCallback(async(body:Record<string,unknown>,walletSession?:CircleEvmEmailSession):Promise<Reply>=>{
    const parent=lifetime.current.signal
    const data=await boundedCheckoutRequest(parent,async signal=>{
      const token=await getAccessToken()
      if(!token||signal.aborted||parent.aborted)throw Error('Sign in again to continue.')
      const response=await fetch('/api/v2/trade-agreements/participant',{method:'POST',signal,headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({...body,agreementId,...(walletSession?{circleUserToken:walletSession.userToken}:{})})})
      const result=await response.json()
      if(!response.ok||!result.ok)throw Error(result.error||'Trade checkout is unavailable.')
      if(result.agreement?.id!==agreementId||result.agreement?.walletAppId!==PRIVY_APP_ID||result.agreement?.terms?.payment?.chainId!==5042||!['customer','provider'].includes(result.role))throw Error('The checkout does not match this Trade agreement.')
      return result as Reply
    })
    if(parent.aborted)throw Error('Your account changed. Reopen the Trade agreement.')
    setReply(current=>({...data,status:data.status??(current?.agreement.binding?.termsHash===data.agreement.binding?.termsHash?current?.status:undefined),execution:Object.hasOwn(data,'execution')?data.execution:current?.execution}))
    return data
  },[agreementId,getAccessToken])
  useEffect(()=>{
    lifetime.current=new AbortController()
    const parent=lifetime.current.signal
    locked.current=true;setRestoring(true);setRestoreFailed(false);setError('')
    void (async()=>{
      const next=await post({action:'read'})
      if(!user?.id||!user.email?.address)return
      const restored=await boundedCheckoutRequest(parent,async signal=>{
        const token=await getAccessToken()
        if(!token)throw Error('Sign in again to restore your Arc wallet.')
        return restoreArcTradeSession({userId:user.id,email:user.email!.address,walletAppId:PRIVY_APP_ID},token,()=>!parent.aborted&&!signal.aborted,next.agreement.accepted[next.role])
      })
      if(parent.aborted||!restored)return
      setSession(restored)
      if(next.agreement.binding)await post({action:'prepare'},restored)
    })().catch(error=>{if(!parent.aborted){setError(error.message);setRestoreFailed(true)}}).finally(()=>{if(!parent.aborted){locked.current=false;setRestoring(false)}})
    return()=>{lifetime.current.abort()}
  },[post,getAccessToken,user?.id,user?.email?.address,restoreAttempt])
  async function run(task:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setAttention(undefined);setError('');try{await task()}catch(error){if(!lifetime.current.signal.aborted){setError((error as Error).message);setAttention('retry')}}finally{if(!lifetime.current.signal.aborted){locked.current=false;setBusy(false)}}}
  async function refresh(walletSession=session){const next=await post({action:'read'});if(walletSession&&next.agreement.binding)await post({action:'prepare'},walletSession)}
  async function connect(){
    const parent=lifetime.current.signal,email=user?.email?.address
    if(!email)throw Error('Sign in with email to connect your Arc wallet.')
    const walletSession=await connectCircleEvmEmailWallet(email,'arc')
    if(parent.aborted)return
    const token=await getAccessToken();if(!token||parent.aborted)throw Error('Sign in again to continue.')
    const resolved=await resolveArcTradeWalletSession(walletSession,token,()=>!parent.aborted)
    if(parent.aborted)return
    if(user?.id)saveArcTradeSession({userId:user.id,email,walletAppId:PRIVY_APP_ID},resolved)
    setSession(resolved);await refresh(resolved)
  }
  async function execute(operation:TradeXLayerAction,resume?:Execution){
    if(!session)throw Error('Connect your Arc wallet first.')
    const proposal=reviewedSettlement
    let settlement:unknown
    if(!resume&&['proposeSettlement','acceptSettlement','withdrawSettlement'].includes(operation)){
      if(!proposal)throw Error('Refresh the split proposal first.')
      if(operation==='proposeSettlement'){
        if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(buyerAmount))throw Error('Enter a buyer refund with up to six decimal places.')
        settlement={nonce:proposal.nonce,buyerAmount:parseUnits(buyerAmount,6).toString()}
      }else settlement={nonce:proposal.nonce,buyerAmount:proposal.buyerAmount,evidence:proposal.evidence}
    }
    if(retryAction.current&&retryAction.current.operation!==operation)throw Error('Recover the previous action before starting another.')
    const pending=resume?{requestId:resume.requestId,operation}:retryAction.current??{requestId:crypto.randomUUID(),operation}
    retryAction.current=pending
    const next=await post({action:'challenge',...pending,...(!resume?{evidence:note,settlement}:{})},session)
    const execution=next.execution
    if(!execution)throw Error('The confirmation record is unavailable. Refresh before retrying.')
    if(terminal(execution)){retryAction.current=undefined;setSelected(undefined);await refresh();return}
    if(!execution.challengeId)throw Error('The Circle confirmation is unavailable. Retry the same action.')
    if(lifetime.current.signal.aborted)return
    setWalletOpen(true)
    try{await executeCircleEvmEmailChallenge({session,challengeId:execution.challengeId})}finally{if(!lifetime.current.signal.aborted)setWalletOpen(false)}
    if(lifetime.current.signal.aborted)return
    try{
      const recovered=await post({action:'recover',requestId:pending.requestId},session)
      if(terminal(recovered.execution)){retryAction.current=undefined;setSelected(undefined)}
    }catch{/* The saved action is recovered by the bounded automatic checks. */}
  }
  // A retry always reads the existing journal first. Never reopen a wallet
  // challenge merely because an SDK callback or status request timed out.
  async function retry(){
    const next=await post({action:'read'})
    if(session&&next.execution?.own&&!terminal(next.execution)){
      if(!next.execution.challengeId){await execute(next.execution.operation,next.execution);return}
      const recovered=await post({action:'recover',requestId:next.execution.requestId},session)
      if(terminal(recovered.execution)){retryAction.current=undefined;setSelected(undefined);await refresh();return}
      if(recovered.execution?.status==='challenge_issued'){if(attention==='resume')await execute(recovered.execution.operation,recovered.execution);else setAttention('resume')}
    }else if(retryAction.current&&session){await execute(retryAction.current.operation)}
    else await refresh()
  }
  useEffect(()=>{
    if(!session||attention)return
    let disposed=false,timer:ReturnType<typeof setTimeout>,failures=0,pendingId='',pendingSince=0
    const schedule=(ms:number)=>{clearTimeout(timer);if(!disposed)timer=setTimeout(()=>void tick(),ms)}
    const tick=async()=>{
      const current=snapshot.current
      if(disposed)return
      if(document.hidden||!navigator.onLine||locked.current||current.selected&&!current.reply?.execution){schedule(5000);return}
      const previous=current.reply?.execution,pending=!!previous&&!terminal(previous)
      if(current.selected&&!pending){schedule(5000);return}
      if(!pending&&current.reply?.status?.state!==undefined&&current.reply.status.state>=6&&(current.reply.status.state===9||current.reply.agreement.receipt))return
      locked.current=true;setChecking(true)
      let delay=pending?5000:20000
      try{
        const next=pending&&previous.own&&previous.challengeId
          ?await post({action:'recover',requestId:previous.requestId},session)
          :await post({action:'read'})
        if(disposed)return
        const execution=next.execution
        if(execution&&!terminal(execution)){
          setSelected(undefined)
          if(pendingId!==execution.requestId){pendingId=execution.requestId;pendingSince=Date.now()}
          if(execution.own&&(!execution.challengeId||Date.now()-pendingSince>=90000)){
            setAttention(execution.status==='submitted'?'retry':'resume');return
          }
          delay=5000
        }else{
          pendingId='';retryAction.current=undefined
          if(pending)setSelected(undefined)
          if(next.agreement.binding&&!next.status)await post({action:'prepare'},session)
        }
        failures=0;setError('')
      }catch(error){
        if(disposed)return
        failures++;delay=Math.min(30000,5000*2**failures)
        if(failures>=3){setError((error as Error).message);setAttention('retry');return}
      }finally{locked.current=false;if(!disposed)setChecking(false)}
      schedule(delay)
    }
    const wake=()=>{if(!document.hidden&&navigator.onLine){clearTimeout(timer);schedule(500)}}
    schedule(1000);document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake)
    return()=>{disposed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake)}
  },[session,post,attention])
  const agreement=reply?.agreement,execution=reply?.execution,pending=!!execution&&!terminal(execution),status=reply?.status
  return <>
    {!agreement&&!error&&<Skeleton/>}
    {agreement&&<>
      <h1 className='mt-3 break-words text-2xl font-semibold tracking-tight'>{agreement.terms.title}</h1>
      <p className='mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-500'>{agreement.terms.description}</p>
      <p className='mt-3 text-xs text-gray-500'>You are the {reply.role==='customer'?'buyer':'seller'} · Arc mainnet</p>
      <div className='mt-5 rounded-2xl bg-gray-50 p-5 dark:bg-white/5'><p className='text-xs text-gray-500'>Agreed payment</p><p className='mt-1 text-3xl font-semibold'>{agreement.terms.amount} <span className='text-base text-gray-500'>USDC</span></p></div>
      <dl className='mt-5 space-y-3 text-sm'>
        <div className='flex justify-between gap-4'><dt>Item price</dt><dd>{agreement.terms.trade.price} USDC</dd></div>
        <div className='flex justify-between gap-4'><dt>Delivery fee</dt><dd>{agreement.terms.trade.deliveryFee} USDC</dd></div>
        <div><dt className='text-gray-500'>Handover</dt><dd>{agreement.terms.trade.handover} · {agreement.terms.trade.location}</dd></div>
        {agreement.terms.trade.carrier&&<div><dt className='text-gray-500'>Carrier</dt><dd>{agreement.terms.trade.carrier}</dd></div>}
        <div><dt className='text-gray-500'>Delivery windows</dt><dd>Dispatch within {agreement.terms.trade.dispatchDays} days · Delivery within {agreement.terms.trade.deliveryDays} days · {agreement.terms.trade.inspectionHours} hours to inspect</dd></div>
        <div><dt className='text-gray-500'>Return terms</dt><dd className='whitespace-pre-wrap break-words'>{agreement.terms.trade.returns}</dd></div>
      </dl>
      <p className='mt-5 text-sm font-semibold' role='status'>{status?.state!==undefined?states[status.state]:(agreement.binding?'Both participants accepted the terms':'Awaiting both participants’ acceptance')}</p>
      {!reply.fundingEnabled&&<p className='mt-3 text-sm text-gray-500'>New Arc Trade payments are unavailable. Existing actions can still be checked and recovered.</p>}
      {status?.fundingIssue&&<p className='mt-2 text-sm text-gray-500'>{status.fundingIssue}</p>}
      {!session?<button className={button+' mt-5'} disabled={busy||restoring} aria-busy={restoring} onClick={()=>restoreFailed?setRestoreAttempt(value=>value+1):void run(connect)}>{restoring?'Restoring Arc wallet...':restoreFailed?'Retry wallet connection':'Connect Arc wallet'}</button>:<p className='mt-4 text-xs text-gray-500'>Arc wallet connected</p>}
      {session&&!agreement.accepted[reply.role]&&<button className={button+' mt-4'} disabled={busy||!reply.fundingEnabled} onClick={()=>void run(async()=>{await post({action:'accept_terms',consentHash:agreement.consentHash},session);await refresh()})}>Accept these Trade terms</button>}
      {pending&&<div className='mt-5 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/15'>
        <p className='text-sm'>{TRADE_ACTION_LABELS[execution.operation]}</p>
        {session&&!attention&&<button className={button} disabled aria-live='polite' aria-busy='true'>{walletOpen?'Confirm in your wallet...':execution.own?'Checking...':'Waiting for the other participant...'}</button>}
        {attention&&<p className='text-sm text-gray-500'>{attention==='resume'?'Wallet confirmation still needs your attention.':'Confirmation is taking longer than expected. Your existing action is saved.'}</p>}
      </div>}
      {execution?.status==='reverted'&&<p className='mt-3 text-sm' role='status'>The last action failed on-chain. No successful payment was confirmed.</p>}
      {session&&!pending&&!selected&&<div className='mt-4 space-y-2'>{status?.actions.filter(action=>action!=='cancel').map(action=><button key={action} className={button} disabled={busy||checking||!!attention||status.pending} onClick={()=>{setNote('');setBuyerAmount('');setReviewedSettlement(status.settlement?{...status.settlement}:undefined);setSelected(action)}}>{TRADE_ACTION_LABELS[action]}</button>)}{status?.actions.includes('cancel')&&<details className='pt-2 text-sm text-gray-500'><summary className='cursor-pointer py-2'>More options</summary><button className={secondary+' mt-2'} disabled={busy||checking||!!attention||status.pending} onClick={()=>setSelected('cancel')}>Cancel unpaid escrow</button></details>}</div>}
      {selected&&!pending&&!attention&&<div className='mt-5 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/15'><h2 className='font-semibold'>{TRADE_ACTION_LABELS[selected]}</h2>
        {['dispatch','refund','dispute','proposeSettlement'].includes(selected)&&<label className='block text-sm'>Note or evidence<textarea className={input+' mt-2'} value={note} maxLength={2000} onChange={event=>setNote(event.target.value)} /></label>}
        {selected==='proposeSettlement'&&<label className='block text-sm'>Buyer refund (USDC)<input className={input+' mt-2'} inputMode='decimal' value={buyerAmount} onChange={event=>setBuyerAmount(event.target.value)}/></label>}
        {['acceptSettlement','withdrawSettlement'].includes(selected)&&reviewedSettlement&&<p className='text-sm'>Buyer refund: {formatUnits(BigInt(reviewedSettlement.buyerAmount),6)} USDC. The remainder goes to the seller.</p>}
        <p className='text-xs text-gray-500'>Review this action before confirming in your wallet.</p><button className={button} disabled={busy||checking} onClick={()=>void run(()=>execute(selected))}>{busy?(walletOpen?'Confirm in your wallet...':'Checking...'):'Continue to wallet confirmation'}</button><button className={secondary} disabled={busy||!!retryAction.current} onClick={()=>setSelected(undefined)}>Back</button>
      </div>}
      {agreement.receipt&&<ArcTradeReceiptCard receipt={agreement.receipt}/>}
      {session&&!pending&&!selected&&status?.state===1&&reply.role==='provider'&&<p className='mt-4 text-sm text-gray-500' role='status'>Waiting for the buyer to pay. This page updates automatically.</p>}
      {checking&&!pending&&<p className='mt-4 text-sm text-gray-500' role='status'>Checking...</p>}
      {attention&&session&&<button className={button+' mt-5'} disabled={busy} onClick={()=>void run(retry)}>{busy?'Checking...':attention==='resume'?'Continue wallet confirmation':'Try again'}</button>}
      {returnTo&&<a className='mx-auto mt-4 block w-fit py-2 text-sm text-gray-500 underline' href={returnTo}>Return to trade</a>}
    </>}
    {busy&&<div className='mt-4 h-2 animate-pulse rounded-full bg-gray-100 dark:bg-white/10' role='status' aria-label='Updating Trade agreement'/>}
    {error&&<div className='mt-4'><p className='text-sm text-red-600 dark:text-red-400' role='alert'>{error}</p>{!agreement&&<button className={secondary+' mt-3'} disabled={busy} onClick={()=>void run(()=>refresh())}>Try again</button>}</div>}
  </>
}
