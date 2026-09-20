import { useEffect,useRef,useState } from 'react'
import { approveCircleMigrationChallenge,type CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { pocketMigrationRequest } from '../lib/pocketMigrationClient'
import { requestPocketPaymentApproval } from '../lib/pocketPaymentApproval'
import type { PocketMigrationFee,PocketMigrationSnapshot } from '../lib/pocketMigrationFlow'
export default function PocketMigrationExecution({session,getAccessToken,onComplete,recovery=false}:{session:CircleEvmEmailSession;recovery?:boolean;getAccessToken():Promise<string|null>;onComplete():void}) {
 const [snapshot,setSnapshot]=useState<PocketMigrationSnapshot|null>(null)
 const [resume,setResume]=useState<{action:'resume'|'recover';network:string;amount:string;source:string;target:string}|null>(null)
 const [quote,setQuote]=useState<PocketMigrationFee|null>(null)
 const [expired,setExpired]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('')
 const active=useRef(false),locked=useRef(false),controller=useRef<AbortController|null>(null)
 const completedCallback=useRef(onComplete);completedCallback.current=onComplete
 async function request<T>(body:Record<string,unknown>,payment=false) {
  const token=await getAccessToken()
  if(!active.current)throw new Error('Migration screen was closed.')
  if(!token)throw new Error('Sign in again to continue your wallet update.')
  return pocketMigrationRequest<T>(token,body,{payment,signal:controller.current?.signal,recovery})
 }
 function accept(next:PocketMigrationSnapshot) {
  if(!active.current)return
  setSnapshot(next)
  setQuote(current=>current && current.revision===next.revision && next.rows.find(row=>row.network===current.network)?.state==='ready' ? current : null)
  if(next.phase==='completed')completedCallback.current()
 }
 async function refresh() {
  const result=await request<{snapshot:PocketMigrationSnapshot}>({action:'status'});accept(result.snapshot)
  const pending=result.snapshot.rows.find(row=>row.state==='pending')
  if(!pending || !active.current)return
  const checked=await request<{snapshot:PocketMigrationSnapshot;state:string;resume?:{action:'resume'|'recover';network:string;amount:string;source:string;target:string}}>({action:'reconcile',network:pending.network,revision:result.snapshot.revision,userToken:session.userToken})
  accept(checked.snapshot)
  if(active.current){setResume((checked.state==='approval_required'||checked.state==='recovery_required')?checked.resume??null:null);if(checked.state==='needs_review')setError('This saved transfer needs review before approval can continue.')}
 }
 useEffect(()=>{
  active.current=true;locked.current=true;controller.current=new AbortController()
  void refresh().catch(reason=>{if(active.current)setError(reason instanceof Error?reason.message:'Migration status is unavailable.')}).finally(()=>{locked.current=false;if(active.current)setBusy(false)})
  return()=>{active.current=false;controller.current?.abort()}
 },[])
 useEffect(()=>{
  if(!quote)return
  const remaining=quote.expiresAt-Date.now();setExpired(remaining<=0)
  const timer=window.setTimeout(()=>setExpired(true),Math.max(0,remaining))
  return()=>window.clearTimeout(timer)
 },[quote])
 const pending=snapshot?.rows.find(row=>row.state==='pending')
 const next=snapshot?.rows.find(row=>row.state==='ready')
 async function run() {
  if(locked.current)return
  locked.current=true;setBusy(true);setError('')
  try {
   if(!snapshot){await refresh();return}
   if(resume) {
    if(!snapshot.enabled)return
    await requestPocketPaymentApproval()
    if(!active.current)return
    const result=await request<{state:string;challengeId?:string}>({action:resume.action,network:resume.network,revision:snapshot.revision,userToken:session.userToken},true)
    if(!active.current)return
    setResume(null)
    if(result.state==='approval'&&result.challengeId)await approveCircleMigrationChallenge(session,result.challengeId,controller.current?.signal)
    else if(result.state==='needs_review')setError('This transfer needs review. A replacement transfer has not been created.')
    await refresh()
   } else if(quote&&!expired) {
    if(!snapshot.enabled)return
    if(quote.expiresAt<=Date.now()){setExpired(true);return}
    await requestPocketPaymentApproval()
    if(!active.current)return
    const result=await request<{state:'approval'|'reconcile';challengeId?:string}>({action:'start',network:quote.network,revision:snapshot.revision,userToken:session.userToken,feeQuoteId:quote.id},true)
    if(!active.current)return
    setQuote(null)
    if(result.state==='approval'&&result.challengeId)await approveCircleMigrationChallenge(session,result.challengeId,controller.current?.signal)
    if(active.current)await refresh()
   } else if(pending) {
    const result=await request<{snapshot:PocketMigrationSnapshot;state:string;resume?:{action:'resume'|'recover';network:string;amount:string;source:string;target:string}}>({action:'reconcile',network:pending.network,revision:snapshot.revision,userToken:session.userToken})
    accept(result.snapshot)
    if(active.current){setResume((result.state==='approval_required'||result.state==='recovery_required') ? result.resume??null : null);if(result.state==='needs_review')setError('This transfer needs review. A replacement transfer has not been created.')}
   } else if(next) {
    const result=await request<{quote:PocketMigrationFee}>({action:'quote',network:next.network,revision:snapshot.revision,userToken:session.userToken})
    if(active.current){setQuote(result.quote);setExpired(result.quote.expiresAt<=Date.now())}
   } else if(snapshot.phase==='ready-to-activate'&&snapshot.enabled) {
    const result=await request<{snapshot:PocketMigrationSnapshot}>({action:'activate',revision:snapshot.revision,userToken:session.userToken})
    accept(result.snapshot)
   } else await refresh()
  } catch(reason) {
   if(active.current){setQuote(null);setResume(null);setError(reason instanceof Error?reason.message:'Migration could not continue.');await refresh().catch(()=>undefined)}
  } finally {locked.current=false;if(active.current)setBusy(false)}
 }
 const unavailable=!!snapshot&&!snapshot.enabled&&(!!resume||(!!quote&&!expired)||snapshot.phase==='ready-to-activate')
 const label=busy?'Checking...':!snapshot?'Check again':resume?(resume.action==='recover'?'Recover transfer status':'Continue approval'):quote?(expired?'Refresh fee':'Confirm transfer'):pending?'Check progress':next?'Review transfer':snapshot.phase==='ready-to-activate'?'Activate updated wallets':'Check progress'
 return <div className='mt-5'>
  {resume?<><p className='text-base font-bold'>Continue your {resume.amount} USDC transfer on {resume.network}</p><dl className='mt-4 space-y-3 text-sm'><div><dt>From your previous wallet</dt><dd className='mt-1 break-all text-xs'>{resume.source}</dd></div><div><dt>To your updated wallet</dt><dd className='mt-1 break-all text-xs'>{resume.target}</dd></div></dl><p className='mt-3 text-xs text-gray-500'>{resume.action==='recover'?'Recover the saved request before continuing approval.':'Continue the saved transfer approval.'}</p></>:quote?<>
   <p className='text-base font-bold'>Move {quote.transferAmount} USDC on {quote.network==='arbitrum'?'Arbitrum':quote.network==='base'?'Base':'Arc'}</p>
   <dl className='mt-4 space-y-3 text-sm'><div><dt className='text-gray-500'>From your previous wallet</dt><dd className='mt-1 break-all text-xs'>{quote.source.address}</dd></div><div><dt className='text-gray-500'>To your updated wallet</dt><dd className='mt-1 break-all text-xs'>{quote.target.address}</dd></div><div className='flex justify-between gap-3'><dt>Estimated network fee</dt><dd>{quote.amount} {quote.asset}</dd></div></dl>
   <p className='mt-3 text-xs leading-5 text-gray-500'>{expired?'This fee estimate expired. Refresh before continuing.':'Gas sponsorship applies only if available for this transaction.'}</p>
  </>:snapshot?<dl className='space-y-3'>{snapshot.rows.map(row=><div key={row.network} className='flex justify-between gap-3 text-sm'><dt className='capitalize'>{row.network}</dt><dd className='text-right'>{row.amount} USDC{row.state==='pending'&&<span className='block text-xs text-gray-500'>Waiting for confirmation</span>}{row.state==='confirmed'&&<span className='block text-xs text-gray-500'>Transfer confirmed</span>}</dd></div>)}</dl>:<p className='text-sm text-gray-500'>Checking migration status...</p>}
  {snapshot&&!snapshot.enabled&&<p className='mt-4 text-sm leading-6 text-gray-500'>Transfers and wallet activation are not available yet.</p>}
  {error&&<p role='alert' className='mt-4 text-sm leading-6 text-red-500'>{error}</p>}
  <button type='button' onClick={()=>void run()} disabled={busy||unavailable} className='mt-5 min-h-12 w-full rounded-full bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'>{label}</button>
  {quote&&<button type='button' disabled={busy} onClick={()=>setQuote(null)} className='mt-2 min-h-12 w-full text-sm font-bold'>Back to balances</button>}
 </div>
}
