import { useEffect, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import ArcTradeReceiptCard from './ArcTradeReceiptCard'
import type {ArcTradeReceipt} from '../../api/trade-agreement/receipt'
import { formatUnits } from 'viem'
import { PrivyWalletConnectButton } from '../lib/PrivyWalletConnectButton'
import type { TradeXLayerStatus } from '../lib/xstocksAgreement/protocol'

type Review={agreement:{receipt?:ArcTradeReceipt;id:string;title:string;terms:{description:string;payment:{chainId:5042};trade?:{handover:string;location:string;returns:string}};evidence:Array<{hash:string;body:string;role:string}>};status:TradeXLayerStatus;reviewer:{address:string;owners:string[];threshold:number;nonce:string};decision:null|{id:string;buyerAmount:string;reason:string;approvedOwners:string[];stale:boolean};typedData?:Record<string,unknown>}
type QueueItem={id:string;projectId:string;title:string;state:number|null;observedBlock:string|null}
const button='shrink-0 whitespace-nowrap inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950'
const secondary='shrink-0 whitespace-nowrap inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold dark:border-white/10 disabled:opacity-40'
const input='mt-2 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-3 text-sm dark:border-white/10'
const stages=['Awaiting seller','Ready to pay','Payment held','Ready for handover','Buyer review','Disputed','Paid','Refunded','Dispute resolved','Cancelled']
export default function ArcTradeReviewOperationsPanel({workspaceId,onBusyChange}:{workspaceId:string;onBusyChange?:(busy:boolean)=>void}){
 const {getAccessToken,user}=usePrivy(),{wallets}=useWallets()
 const [reference,setReference]=useState(''),[review,setReview]=useState<Review>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[executeReview,setExecuteReview]=useState(false),[submitted,setSubmitted]=useState('')
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const actor=useRef(user?.id);actor.current=user?.id
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false)},[busy,onBusyChange])
 function assertSession(){if(!alive.current)throw Error('Reopen this case before continuing.')}
 const [cases,setCases]=useState<QueueItem[]>([]),[filter,setFilter]=useState<'disputed'|'all'>('disputed'),[cursor,setCursor]=useState<string|null>(null),[queueBusy,setQueueBusy]=useState(false),[queueError,setQueueError]=useState('')
 const queueRequest=useRef(0)
 async function loadQueue(after=''){
  const request=++queueRequest.current;setQueueBusy(true);setQueueError('')
  try{const page=await api('list',{filter,cursor:after});if(request!==queueRequest.current)return;setCases(current=>after?[...current,...page.items]:page.items);setCursor(page.nextCursor)}
  catch(e){if(request===queueRequest.current)setQueueError(e instanceof Error?e.message:'Cases could not load.')}
  finally{if(request===queueRequest.current)setQueueBusy(false)}
 }
 useEffect(()=>{setCases([]);setCursor(null);void loadQueue();return()=>{queueRequest.current++}},[workspaceId,user?.id,filter])
 const ownerWallets=wallets.filter(w=>w.walletClientType!=='privy'&&review?.reviewer.owners.some(a=>a.toLowerCase()===w.address.toLowerCase()))
 async function api(action:string,extra:Record<string,unknown>={},id=review?.agreement.id||reference.trim()){
  assertSession();const identity=actor.current,token=await getAccessToken();assertSession();if(!token)throw Error('Sign in again to continue.')
  const response=await fetch('/api/arc-trade-review?workspace='+encodeURIComponent(workspaceId),{signal:AbortSignal.timeout(30000),method:'POST',cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action,agreementId:id,...extra})})
  const result=await response.json().catch(()=>null);if(!alive.current||actor.current!==identity)throw Error('Your admin session changed. Reopen the case.')
  if(!response.ok||!result?.ok)throw Error(result?.error||'Dispute review could not load. Try again.');return result
 }
 async function run(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await work()}catch(e){setError(e instanceof Error?e.message:'Action could not complete.')}finally{setBusy(false)}}
 async function load(id=reference.trim()){setReview(undefined);setExecuteReview(false);setSubmitted('');const value=await api('read',{},id);setReview(value);if(value.decision){try{setSubmitted(sessionStorage.getItem('hpl-review-submission:'+value.decision.id)||'')}catch{}}setAmount(value.decision?.buyerAmount||'');setReason(value.decision?.reason||'')}
 async function walletProvider(wallet:typeof wallets[number]){
  await wallet.switchChain(5042);const provider=await wallet.getEthereumProvider()
  const chain=await provider.request({method:'eth_chainId'}),accounts=await provider.request({method:'eth_accounts'}) as string[]
  if(Number(chain)!==5042||!accounts.some(a=>a.toLowerCase()===wallet.address.toLowerCase()))throw Error('Select the reviewer account on Arc.')
  return provider
 }
 async function sign(wallet:typeof wallets[number]){
  const fresh=await api('read');setReview(fresh)
  if(!fresh.typedData||!fresh.decision||fresh.decision.stale||fresh.decision.id!==review?.decision?.id)throw Error('The decision changed. Review it again.')
  const provider=await walletProvider(wallet)
  const typedData={...fresh.typedData,types:{...fresh.typedData.types,EIP712Domain:[{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}]}}
  assertSession();if(Number(fresh.typedData.domain?.chainId)!==5042||fresh.typedData.domain?.verifyingContract?.toLowerCase()!==fresh.reviewer.address.toLowerCase())throw Error('Review network changed.');
  const signature=await provider.request({method:'eth_signTypedData_v4',params:[wallet.address,JSON.stringify(typedData)]})
  setReview(await api('sign',{decisionId:fresh.decision.id,signature}));setNotice('Reviewer approval verified and saved.')
 }
 async function execute(wallet:typeof wallets[number]){
  if(!executeReview||submitted)throw Error('Review execution before continuing.')
  const provider=await walletProvider(wallet),prepared=await api('execution',{decisionId:review?.decision?.id,executor:wallet.address})
  if(Number(await provider.request({method:'eth_chainId'}))!==5042)throw Error('Switch back to Arc before executing.')
  assertSession();if(prepared.transaction?.chainId!==5042||prepared.transaction?.to?.toLowerCase()!==review?.reviewer.address.toLowerCase())throw Error('Execution does not match this reviewer wallet.');
  setExecuteReview(false)
  // No automated retry: a wallet timeout may follow a successful submission.
  setSubmitted('pending');try{sessionStorage.setItem('hpl-review-submission:'+review!.decision!.id,'pending')}catch{throw Error('Unable to save transaction recovery state. No transaction was sent.')}
  try{const hash=await provider.request({method:'eth_sendTransaction',params:[{chainId:'0x13b2',from:wallet.address,to:prepared.transaction.to,data:prepared.transaction.data,value:'0x0'}]}) as string;setSubmitted(hash);sessionStorage.setItem('hpl-review-submission:'+review!.decision!.id,hash);setNotice('Transaction submitted. Refresh the case to verify settlement.')}catch(e){if(Number((e as {code?:number})?.code)===4001){sessionStorage.removeItem('hpl-review-submission:'+review!.decision!.id);setSubmitted('');throw Error('Wallet request cancelled. No retry was sent.')}setError('Submission was not confirmed. Check the reviewer wallet activity and refresh this case before trying again.')}
 }
 const asset='USDC'
 const total=review?.status.amount?formatUnits(BigInt(review.status.amount),review.status.decimals??18):'0'
 return <section className="mt-7 rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111216] sm:p-7">
  <h1 className="text-xl font-semibold">Trade disputes</h1><p className="mt-2 text-sm text-gray-500">Review Arc USDC payments and collect reviewer approvals.</p>
  <div className="mt-6 border-b border-gray-200 pb-6 dark:border-white/10">
   <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Cases<select className={input} value={filter} onChange={e=>setFilter(e.target.value as 'disputed'|'all')}><option value="disputed">Observed disputes</option><option value="all">All stored Trades</option></select></label><button className={secondary+' mt-6'} disabled={queueBusy} onClick={()=>void loadQueue()}>Refresh cases</button></div>
   <p className="mt-3 text-xs text-gray-500">Last observed status for this workspace. Opening a case checks the current chain state. New disputes appear after the payment status is observed.</p>
   {queueError&&<p role="alert" className="mt-3 text-sm text-red-600">{queueError}</p>}
   {!queueBusy&&!queueError&&!cases.length&&<p className="mt-4 text-sm text-gray-500">{filter==='disputed'?'No observed disputes in this workspace.':'No stored Trades in this workspace.'}</p>}
   <ul className="mt-3 divide-y divide-gray-100 dark:divide-white/10">{cases.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium break-words">{item.title||'Trade payment'}</p><p className="mt-1 text-xs text-gray-500">{item.state===null?'Not yet observed':stages[item.state]||'Status unavailable'}{item.observedBlock?' · Block '+item.observedBlock:''}</p><p className="mt-1 break-all text-xs text-gray-500">{item.id}</p></div><button className={secondary} disabled={busy} onClick={()=>{setReference(item.id);void run(()=>load(item.id))}}>Review case</button></li>)}</ul>
   {queueBusy&&<div role="status" aria-label="Loading cases" className="mt-3 h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10"/>}
   {cursor&&<button className={secondary+' mt-3'} disabled={queueBusy} onClick={()=>void loadQueue(cursor)}>Load more</button>}
  </div>
  <form className="mt-6 flex flex-col items-end gap-3 sm:flex-row" onSubmit={e=>{e.preventDefault();void run(load)}}><label className="w-full text-sm">Agreement reference<input className={input} value={reference} onChange={e=>setReference(e.target.value)} placeholder="tag_…" disabled={busy}/></label><button className={button} disabled={busy||!reference.trim()}>Open case</button></form>
  {error&&<p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}{notice&&<p role="status" className="mt-4 text-sm text-gray-600 dark:text-gray-300">{notice}</p>}
  {busy&&<div role="status" aria-label="Checking case" className="mt-4 h-3 animate-pulse rounded-full bg-gray-100 dark:bg-white/10"/>}
  {review&&<div className="mt-6 space-y-6">
   <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{review.agreement.title}</h2><p className="mt-1 text-sm text-gray-500">{stages[review.status.state??-1]||'Status unavailable'}</p></div><button className={secondary} disabled={busy} onClick={()=>void run(async()=>{setReview(await api('read',/^0x[a-f0-9]{64}$/i.test(submitted)?{transactionHash:submitted}:{}))})}>Refresh</button></div>
   <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-gray-500">Agreed USDC amount</dt><dd>{total} {asset}</dd></div><div><dt className="text-gray-500">Required approvals</dt><dd>{review.reviewer.threshold} of {review.reviewer.owners.length}</dd></div><div className="sm:col-span-2"><dt className="text-gray-500">Reviewer wallet</dt><dd className="break-all">{review.reviewer.address}</dd></div></dl>
   <details className="border-t border-gray-200 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-medium">Agreed terms</summary><p className="mt-3 whitespace-pre-wrap text-sm text-gray-500">{review.agreement.terms.description}</p>{review.agreement.terms.trade&&<><p className="mt-3 text-sm">{review.agreement.terms.trade.handover} ? {review.agreement.terms.trade.location}</p><p className="mt-3 whitespace-pre-wrap text-sm text-gray-500">{review.agreement.terms.trade.returns}</p></>}</details>
   <details className="border-t border-gray-200 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-medium">Shared notes</summary>{review.agreement.evidence.map(n=><p key={n.hash} className="mt-3 whitespace-pre-wrap text-sm text-gray-500">{n.body}</p>)}</details>
   {review.status.state===5&&<>
    {!review.decision?<form className="space-y-4 border-t border-gray-200 pt-5 dark:border-white/10" onSubmit={e=>{e.preventDefault();void run(async()=>{setReview(await api('prepare',{buyerAmount:amount,reason}));setNotice('Decision saved. Both owners must approve this exact allocation.')})}}>
     <h3 className="font-semibold">Resolution</h3><div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={()=>setAmount(total)}>Full buyer refund</button><button type="button" className={secondary} onClick={()=>setAmount('0')}>Pay seller</button></div>
     <label className="block text-sm">Buyer refund (USDC)<input className={input} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/><span className="mt-2 block text-xs text-gray-500">Enter a quantity from 0 to {total}. The seller receives the remaining USDC.</span></label>
     <label className="block text-sm">Decision reason<textarea className={input} value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={2000} required/></label><button className={button} disabled={busy}>Prepare decision</button>
    </form>:<div className="space-y-4 border-t border-gray-200 pt-5 dark:border-white/10"><h3 className="font-semibold">Prepared decision</h3><p className="text-sm">Buyer allocation: {review.decision.buyerAmount} of {total} {asset}</p><p className="whitespace-pre-wrap text-sm text-gray-500">{review.decision.reason}</p><p className="text-xs text-gray-500">Allocations divide the funded USDC amount.</p>
     {review.decision.stale?<p role="alert" className="text-sm text-red-600">The reviewer wallet changed. This decision cannot be signed or executed.</p>:<>
      <ul className="divide-y divide-gray-100 dark:divide-white/10">{review.reviewer.owners.map(owner=><li key={owner} className="flex flex-wrap justify-between gap-2 py-3 text-xs"><span className="break-all">{owner}</span><span>{review.decision!.approvedOwners.includes(owner.toLowerCase())?'Approved':'Awaiting approval'}</span></li>)}</ul>
      <PrivyWalletConnectButton className={secondary} disabled={busy}>Connect reviewer wallet</PrivyWalletConnectButton>
      {ownerWallets.map(wallet=><div key={wallet.address} className="flex flex-wrap gap-2"><button className={button} disabled={busy||review.decision!.approvedOwners.includes(wallet.address.toLowerCase())} onClick={()=>void run(()=>sign(wallet))}>Approve with {wallet.address.slice(0,6)}…{wallet.address.slice(-4)}</button></div>)}
      {!ownerWallets.length&&<p className="text-xs text-gray-500">Connect one of the reviewer owner wallets shown above.</p>}
      {review.decision.approvedOwners.length>=review.reviewer.threshold&&!submitted&&<div className="rounded-xl border border-gray-200 p-4 dark:border-white/10">{!executeReview?<button className={button} disabled={busy} onClick={()=>setExecuteReview(true)}>Review execution</button>:<><p className="mb-3 text-sm">Execute the approved allocation on Arc. Settlement transfers the held USDC and is final. Network fees apply.</p>{ownerWallets.map(wallet=><button key={wallet.address} className={button} disabled={busy} onClick={()=>void run(()=>execute(wallet))}>Execute with {wallet.address.slice(0,6)}…</button>)}<button className={secondary} disabled={busy} onClick={()=>setExecuteReview(false)}>Cancel</button></>}</div>}
      {submitted&&<p className="break-all text-sm">{submitted==='pending'?'Check reviewer wallet activity before any retry.':'Submitted: '+submitted}</p>}
     </>}
     {review.agreement.receipt&&<ArcTradeReceiptCard receipt={review.agreement.receipt}/>}
  </div>}
   </>}
   {review.agreement.receipt&&<ArcTradeReceiptCard receipt={review.agreement.receipt}/>}
  </div>}
 </section>
}
