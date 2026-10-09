import {useCallback,useEffect,useRef,useState} from 'react'
import {executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {pocketBridgeNetworkLabel} from '../lib/pocketBridgeNetworks'
import PocketSelect from './PocketSelect'
import PocketTransactionSheet from './PocketTransactionSheet'
import PocketSlideAction from './PocketSlideAction'
import {Loader2} from './PocketIcons'
import {formatPocketDisplayAmount} from '../lib/pocketMoney'

const NETWORKS=['base','arbitrum','ethereum','polygon'] as const
type Network=typeof NETWORKS[number]
type Quote={id:string;source:Network;destination:Network;walletAddress:string;amount:string;receive:string;minimumReceive:string;fee:string;expiresAt:number}
type Pending={quote:Quote;quoteToken:string;challengeId?:string;txHash?:string;sourceConfirmed?:boolean;needsAttention?:boolean}
type Props={owner:string;getAccessToken():Promise<string|null>;getSession(network:Network,address:string):Promise<CircleEvmEmailSession>;onBusyChange(value:boolean):void;onActivity():void;refresh():Promise<unknown>;balances:Array<{key:string;usdt?:number;usdtStale?:boolean}>}
export default function PocketUsdtBridgePanel(props:Props){
  const [source,setSource]=useState<Network>('arbitrum'),[destination,setDestination]=useState<Network>('base')
  const [amount,setAmount]=useState(''),[quoted,setQuoted]=useState<(Pending&{sufficientBalance:boolean})|null>(null)
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [recoveryFailed,setRecoveryFailed]=useState(false),[reload,setReload]=useState(0)
  const [preparing,setPreparing]=useState(false),[quoteExpired,setQuoteExpired]=useState(false)
  const [result,setResult]=useState<{quote:Quote;state:'successful'|'failed';txHash?:string;destinationTxHash?:string}|null>(null)
  const lock=useRef(false),version=useRef(0),session=useRef<CircleEvmEmailSession|null>(null),currentOwner=useRef(props.owner)
  currentOwner.current=props.owner
  const key='pocket:usdt-bridge:v1:'+encodeURIComponent(props.owner)
  const save=(value:Pending|null)=>{if(value)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);setPending(value)}
  const api=useCallback(async(body?:Record<string,unknown>)=>{
    const token=await props.getAccessToken();if(!token)throw Error('Sign in to bridge stablecoins.')
    const response=await fetch(pocketApiUrl('/api/pocket/usdt-bridge'),{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)})
    const data=await response.json().catch(()=>({ok:false,error:'Bridge service is unavailable.'}));if(response.status===404)throw Error('USDT bridging is updating. Try again shortly.');if(!response.ok||!data.ok)throw Error(data.error?.message||data.error||'Bridge request failed.');return data
  },[props.getAccessToken])
  useEffect(()=>{let disposed=false;setLoading(true);setRecoveryFailed(false);setError('');setPending(null);session.current=null
    const owner=props.owner
    void (async()=>{
      try{const stored=localStorage.getItem(key);if(stored){const p=JSON.parse(stored);if(!p.quoteToken||!p.quote?.id)throw Error('Saved bridge details could not be read. Contact support before retrying.');if(!disposed)setPending(p)}
        const data=await api();if(disposed||currentOwner.current!==owner)return;if(data.pending?.length)save(data.pending[0]);setLoading(false)
      }catch(e){if(!disposed){setError((e as Error).message);setRecoveryFailed(true);setLoading(false)}}
    })();return()=>{disposed=true;version.current++}
  },[props.owner,api,key,reload])
  useEffect(()=>{props.onBusyChange(busy||preparing);return()=>props.onBusyChange(false)},[busy,preparing,props.onBusyChange])
  useEffect(()=>{setQuoteExpired(false);if(!quoted)return;const timer=window.setTimeout(()=>setQuoteExpired(true),Math.max(0,quoted.quote.expiresAt-Date.now()));return()=>clearTimeout(timer)},[quoted])
  const invalidate=()=>{version.current++;setQuoted(null);setError('');setNotice('');session.current=null}
  async function quote(){
    if(lock.current||busy||preparing||pending||loading||recoveryFailed)return
    lock.current=true
    const requestVersion=++version.current;setBusy(true);setError('');setQuoted(null)
    try{const data=await api({action:'quote',source,destination,amount});if(requestVersion===version.current)setQuoted(data)}catch(e){if(requestVersion===version.current)setError((e as Error).message)}finally{lock.current=false;setBusy(false)}
  }
  async function check(value:Pending,_interactive=true){
    if(lock.current)return
    lock.current=true;setError('')
    const owner=props.owner
    try{
      const active=session.current
      const result=await api({action:'status',quoteToken:value.quoteToken,txHash:value.txHash,...(active?{circleUserToken:active.userToken}:{})})
      if(currentOwner.current!==owner)return
      if(result.status==='completed'){save(null);setQuoted(null);setAmount('');setNotice('');setResult({quote:value.quote,state:'successful',txHash:result.txHash,destinationTxHash:result.destinationTxHash});void props.refresh();props.onActivity()}
      else if(result.status==='failed'){save(null);setQuoted(null);setResult({quote:value.quote,state:'failed'});setError('The source transaction did not complete. You can request a new quote.')}
      else if(result.status==='not_submitted'&&Date.now()>value.quote.expiresAt+60000){save(null);setQuoted(null);setNotice('This quote expired without a submitted bridge. Request a new quote.')}
      else{save({...value,...(result.txHash?{txHash:result.txHash}:{}),...(result.challengeId?{challengeId:result.challengeId}:{}),sourceConfirmed:Boolean(result.sourceConfirmed||value.sourceConfirmed),needsAttention:result.status==='needs_attention'});setNotice('');if(result.status==='needs_attention')setError('This bridge needs review. Contact support before sending again.');props.onActivity()}
    }catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}
  }
  async function prepare(){
    setError('')
    try{
      if(!quoted||quoted.quote.expiresAt<=Date.now())throw Error('Quote expired. Refresh the quote to continue.')
      session.current=await props.getSession(source,quoted.quote.walletAddress)
      if(quoted.quote.expiresAt<=Date.now())throw Error('Quote expired. Refresh the quote to continue.')
    }catch(e){session.current=null;setError((e as Error).message||'Could not prepare your wallet. Please try again.');throw e}
  }
  async function execute(){
    if(lock.current||!quoted||!session.current||!quoted.sufficientBalance)return
    if(quoted.quote.expiresAt<=Date.now()){setQuoted(null);setError('Quote expired. Review a new quote.');return}
    lock.current=true;setBusy(true);setError('');let saved:Pending|null=null
    const owner=props.owner
    try{
      saved={quote:quoted.quote,quoteToken:quoted.quoteToken};save(saved)
      const response=await api({action:'execute',quoteToken:saved.quoteToken,circleUserToken:session.current.userToken})
      if(currentOwner.current!==owner)return
      saved={...saved,challengeId:response.challengeId};save(saved)
      const result=await executeCircleEvmEmailChallenge({session:session.current,challengeId:response.challengeId,pendingMessage:'Your bridge is saved. We will update it automatically.'})
      if(currentOwner.current!==owner)return
      if(result.transactionHash){saved={...saved,txHash:result.transactionHash};save(saved)}
      setNotice('');props.onActivity();void props.refresh()
    }catch(e){setError(saved?'Your bridge is saved. We will update it automatically.':(e as Error).message)}finally{lock.current=false;setBusy(false)}
    if(saved&&currentOwner.current===owner)void check(saved,false)
  }
  const checkRef=useRef(check);checkRef.current=check
  useEffect(()=>{
    if(!pending)return
    const run=()=>{if(document.visibilityState==='visible'&&!lock.current)void checkRef.current(pending,false)}
    const initial=window.setTimeout(run,0),timer=window.setInterval(run,8000)
    document.addEventListener('visibilitychange',run)
    return()=>{clearTimeout(initial);clearInterval(timer);document.removeEventListener('visibilitychange',run)}
  },[pending?.quote.id,pending?.txHash])
  useEffect(()=>{if(pending){setSource(pending.quote.source);setDestination(pending.quote.destination);setAmount(pending.quote.amount)}},[pending?.quote.id])
  const balance=props.balances.find(row=>row.key===source)
  const locked=busy||preparing||loading||Boolean(pending)
  const validAmount=/^\d+(\.\d{1,6})?$/.test(amount)&&Number(amount)>0
  return <>
    <section className="space-y-5 rounded-[26px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#0D0D0D]">
      <div className="grid grid-cols-2 gap-3">
        <div><p className="mb-2 text-xs font-medium text-gray-500">From</p><PocketSelect showNetworkBalances={false} value={source} disabled={locked} ariaLabel="USDT source network" options={NETWORKS.map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} onChange={value=>{invalidate();setSource(value as Network);if(value===destination)setDestination(NETWORKS.find(n=>n!==value)!);setAmount('')}}/></div>
        <div><p className="mb-2 text-xs font-medium text-gray-500">To</p><PocketSelect showNetworkBalances={false} value={destination} disabled={locked} ariaLabel="USDT destination network" options={NETWORKS.filter(n=>n!==source).map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} onChange={value=>{invalidate();setDestination(value as Network)}}/></div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-[#121212]"><span className="text-xs font-medium text-gray-500">Available</span><span className="text-sm font-semibold tabular-nums">{balance?.usdt!==undefined&&!balance.usdtStale?formatPocketDisplayAmount(balance.usdt)+' USDT':'—'}</span></div>
      <label className="block text-xs font-medium text-gray-500">Amount<input aria-label="USDT bridge amount" inputMode="decimal" value={amount} disabled={locked} onChange={event=>{invalidate();setAmount(event.target.value)}} placeholder="0.00" className="mt-2 w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-4 text-base font-semibold text-gray-900 outline-none focus:border-gray-400 dark:border-[#262626] dark:focus:border-gray-500 dark:text-white"/></label>
      {quoted&&!pending&&<div className="space-y-2 rounded-2xl bg-gray-50 p-4 text-xs dark:bg-[#121212]"><div className="flex justify-between"><span>You receive</span><span className="font-semibold">{quoted.quote.receive} USDT</span></div><div className="flex justify-between"><span>Minimum received</span><span className="font-semibold">{quoted.quote.minimumReceive} USDT</span></div><div className="flex justify-between"><span>Bridge fee included</span><span className="font-semibold">{quoted.quote.fee} USDT</span></div>{!quoted.sufficientBalance&&<p>Insufficient USDT on {pocketBridgeNetworkLabel(source)}.</p>}</div>}
      {pending?<button type="button" className="pocket-cta-primary w-full" disabled={!pending.needsAttention} aria-busy={!pending.needsAttention} onClick={()=>void check(pending)}>{!pending.needsAttention&&<Loader2 className="h-4 w-4 animate-spin"/>}<span>{pending.needsAttention?'Retry status check':pending.sourceConfirmed?'Arriving on '+pocketBridgeNetworkLabel(pending.quote.destination):'Bridging USDT'}</span></button>
      :!quoted||(quoteExpired&&!preparing)?<button type="button" disabled={busy||loading||(!recoveryFailed&&!validAmount)} aria-busy={busy||loading} onClick={()=>recoveryFailed?setReload(value=>value+1):void quote()} className="pocket-cta-primary w-full">{(busy||loading)&&<Loader2 className="h-4 w-4 animate-spin"/>}<span>{busy?'Getting quote':loading?'Loading':recoveryFailed?'Try again':quoteExpired?'Refresh quote':'Review bridge'}</span></button>
      :<PocketSlideAction key={quoted.quote.id} approvalRequired={false} onPrepare={prepare} onApprovalBusyChange={setPreparing} status={busy?'pending':'idle'} disabled={busy||!quoted.sufficientBalance} onConfirm={()=>void execute()} labels={{idle:preparing?'Preparing bridge':'Confirm bridge',disabled:'Insufficient balance',pending:'Preparing bridge',submitted:'Bridging USDT',successful:'Bridge successful'}}/>}
      {notice&&<p role="status" className="text-center text-xs text-gray-500">{notice}</p>}{error&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
    </section>
    {result&&<PocketTransactionSheet title="Bridge stablecoins" state={result.state} statusLabel={result.state==='successful'?'Bridge successful':'Bridge failed'} amount={result.quote.amount+' USDT'} detailsRows={[
      ['Asset','USDT'],['From',pocketBridgeNetworkLabel(result.quote.source)],['To',pocketBridgeNetworkLabel(result.quote.destination)],['Bridge fee',result.quote.fee+' USDT'],...(result.txHash?[['Transaction',result.txHash] as [string,string]]:[]),...(result.destinationTxHash?[['Destination transaction',result.destinationTxHash] as [string,string]]:[])
    ]} onDone={()=>setResult(null)}/>}
  </>
}
