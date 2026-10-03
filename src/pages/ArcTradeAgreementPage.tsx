import {useCallback,useEffect,useRef,useState} from 'react'
import {useParams,useSearchParams} from 'react-router-dom'
import {usePrivy} from '@privy-io/react-auth'
import {formatUnits,parseUnits} from 'viem'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import {CheckoutTrustLine,HashPayLinkCheckoutBrand} from '../components/CheckoutChrome'
import {connectCircleEvmEmailWallet,executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../lib/circleEvmEmailWallet'
import {linkPocketWallet} from '../pocket/api/pocketWalletLinkClient'
import {boundedCheckoutRequest} from '../lib/xstocksAgreement/boundedRequest'
import {tradeReturnUrl} from '../lib/xstocksAgreement/tradeReturn'
import {TRADE_ACTION_LABELS,type TradeXLayerAction} from '../lib/xstocksAgreement/protocol'
import {PRIVY_APP_ID} from '../lib/authMode'
import type {ArcHostedTrade} from '../../api/trade-agreement/arc-http'
import type {ArcTradeStatus} from '../../api/trade-agreement/arc-planner'

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
    {authenticated&&<button type='button' className='mx-auto mt-3 block min-h-11 text-xs text-gray-500 underline' onClick={()=>void logout()}>Switch account</button>}
  </section>
}
function Connected({agreementId,returnTo}:{agreementId:string;returnTo?:string}){
  const {user,getAccessToken}=usePrivy()
  const [reply,setReply]=useState<Reply>(),[session,setSession]=useState<CircleEvmEmailSession>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [selected,setSelected]=useState<TradeXLayerAction>(),[note,setNote]=useState(''),[buyerAmount,setBuyerAmount]=useState('')
  const [reviewedSettlement,setReviewedSettlement]=useState<ArcTradeStatus['settlement']>()
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
    setReply(current=>({...data,status:data.status??(body.action==='read'?undefined:current?.status),execution:Object.hasOwn(data,'execution')?data.execution:current?.execution}))
    return data
  },[agreementId,getAccessToken])
  useEffect(()=>{
    lifetime.current=new AbortController()
    void post({action:'read'}).catch(error=>{if(!lifetime.current.signal.aborted)setError(error.message)})
    return()=>{lifetime.current.abort()}
  },[post])
  async function run(task:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await task()}catch(error){if(!lifetime.current.signal.aborted)setError((error as Error).message)}finally{if(!lifetime.current.signal.aborted){locked.current=false;setBusy(false)}}}
  async function refresh(walletSession=session){const next=await post({action:'read'});if(walletSession&&next.agreement.binding)await post({action:'prepare'},walletSession)}
  async function connect(){
    const parent=lifetime.current.signal,email=user?.email?.address
    if(!email)throw Error('Sign in with email to connect your Arc wallet.')
    const walletSession=await connectCircleEvmEmailWallet(email,'arc')
    if(parent.aborted)return
    const token=await getAccessToken();if(!token||parent.aborted)throw Error('Sign in again to continue.')
    await linkPocketWallet({accessToken:token,network:'arc',circleUserToken:walletSession.userToken,wallet:walletSession.wallet})
    if(parent.aborted)return
    setSession(walletSession);await refresh(walletSession)
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
    await executeCircleEvmEmailChallenge({session,challengeId:execution.challengeId})
    if(lifetime.current.signal.aborted)return
    const recovered=await post({action:'recover',requestId:pending.requestId},session)
    if(terminal(recovered.execution)){retryAction.current=undefined;setSelected(undefined)}
  }
  async function recover(){if(!session||!reply?.execution?.own)throw Error('Connect the wallet that started this action.');const next=await post({action:'recover',requestId:reply.execution.requestId},session);if(terminal(next.execution)){retryAction.current=undefined;setSelected(undefined)}}
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
      {!session?<button className={button+' mt-5'} disabled={busy} onClick={()=>void run(connect)}>Connect Arc wallet</button>:<p className='mt-4 text-xs text-gray-500'>Arc wallet connected</p>}
      {session&&!agreement.accepted[reply.role]&&<button className={button+' mt-4'} disabled={busy||!reply.fundingEnabled} onClick={()=>void run(async()=>{await post({action:'accept_terms',consentHash:agreement.consentHash},session);await refresh()})}>Accept these Trade terms</button>}
      {pending&&<div className='mt-5 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/15'><p className='text-sm'>{TRADE_ACTION_LABELS[execution.operation]} · {execution.status==='reserved'?'Confirmation pending':execution.status==='submitted'?'Checking on-chain confirmation':'Awaiting wallet confirmation'}</p>{execution.own?<><button className={secondary} disabled={busy||!session} onClick={()=>void run(recover)}>Check action status</button>{execution.status!=='submitted'&&<button className={button} disabled={busy||!session} onClick={()=>void run(()=>execute(execution.operation,execution))}>Resume confirmation</button>}</>:<p className='text-xs text-gray-500'>The other participant has an action in progress.</p>}</div>}
      {execution?.status==='reverted'&&<p className='mt-3 text-sm' role='status'>The last action failed on-chain. Refresh the agreement before trying again.</p>}
      {session&&!pending&&!selected&&<div className='mt-4 space-y-2'>{status?.actions.map(action=><button key={action} className={secondary} disabled={busy||status.pending} onClick={()=>{setNote('');setBuyerAmount('');setReviewedSettlement(status.settlement?{...status.settlement}:undefined);setSelected(action)}}>{TRADE_ACTION_LABELS[action]}</button>)}</div>}
      {selected&&!pending&&<div className='mt-5 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/15'><h2 className='font-semibold'>{TRADE_ACTION_LABELS[selected]}</h2>
        {['dispatch','refund','dispute','proposeSettlement'].includes(selected)&&<label className='block text-sm'>Note or evidence<textarea className={input+' mt-2'} value={note} maxLength={2000} onChange={event=>setNote(event.target.value)} /></label>}
        {selected==='proposeSettlement'&&<label className='block text-sm'>Buyer refund (USDC)<input className={input+' mt-2'} inputMode='decimal' value={buyerAmount} onChange={event=>setBuyerAmount(event.target.value)}/></label>}
        {['acceptSettlement','withdrawSettlement'].includes(selected)&&reviewedSettlement&&<p className='text-sm'>Buyer refund: {formatUnits(BigInt(reviewedSettlement.buyerAmount),6)} USDC. The remainder goes to the seller.</p>}
        <p className='text-xs text-gray-500'>Review this action before confirming in your wallet.</p><button className={button} disabled={busy} onClick={()=>void run(()=>execute(selected))}>Continue to wallet confirmation</button><button className={secondary} disabled={busy||!!retryAction.current} onClick={()=>setSelected(undefined)}>Back</button>
      </div>}
      <button className={secondary+' mt-5'} disabled={busy} onClick={()=>void run(()=>refresh())}>Refresh agreement</button>
      {returnTo&&<a className={secondary+' mt-3 block text-center'} href={returnTo}>Return to trade</a>}
    </>}
    {busy&&<div className='mt-4 h-2 animate-pulse rounded-full bg-gray-100 dark:bg-white/10' role='status' aria-label='Updating Trade agreement'/>}
    {error&&<div className='mt-4'><p className='text-sm text-red-600 dark:text-red-400' role='alert'>{error}</p>{!agreement&&<button className={secondary+' mt-3'} disabled={busy} onClick={()=>void run(()=>refresh())}>Try again</button>}</div>}
  </>
}
