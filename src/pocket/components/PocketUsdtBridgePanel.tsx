import {useCallback,useEffect,useRef,useState} from 'react'
import {executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {pocketBridgeNetworkLabel} from '../lib/pocketBridgeNetworks'
import PocketSelect from './PocketSelect'
import PocketSlideAction from './PocketSlideAction'
import {formatPocketDisplayAmount} from '../lib/pocketMoney'

const NETWORKS=['base','arbitrum','ethereum','polygon'] as const
type Network=typeof NETWORKS[number]
type Quote={id:string;source:Network;destination:Network;walletAddress:string;amount:string;receive:string;minimumReceive:string;fee:string;expiresAt:number}
type Pending={quote:Quote;quoteToken:string;challengeId?:string;txHash?:string}
type Props={owner:string;getAccessToken():Promise<string|null>;getSession(network:Network,address:string):Promise<CircleEvmEmailSession>;onBusyChange(value:boolean):void;onActivity():void;refresh():Promise<unknown>;balances:Array<{key:string;usdt?:number;usdtStale?:boolean}>}
export default function PocketUsdtBridgePanel(props:Props){
  const [source,setSource]=useState<Network>('arbitrum'),[destination,setDestination]=useState<Network>('base')
  const [amount,setAmount]=useState(''),[quoted,setQuoted]=useState<(Pending&{sufficientBalance:boolean})|null>(null)
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [recoveryFailed,setRecoveryFailed]=useState(false),[reload,setReload]=useState(0)
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
  useEffect(()=>{props.onBusyChange(busy);return()=>props.onBusyChange(false)},[busy,props.onBusyChange])
  const invalidate=()=>{version.current++;setQuoted(null);setError('');setNotice('');session.current=null}
  async function quote(){
    if(lock.current||pending||loading||recoveryFailed)return
    const requestVersion=++version.current;setBusy(true);setError('');setQuoted(null)
    try{const data=await api({action:'quote',source,destination,amount});if(requestVersion===version.current)setQuoted(data)}catch(e){if(requestVersion===version.current)setError((e as Error).message)}finally{setBusy(false)}
  }
  async function check(value:Pending,interactive=true){
    if(lock.current)return
    lock.current=true;setBusy(true);setError('')
    const owner=props.owner
    try{
      const active=interactive?await props.getSession(value.quote.source,value.quote.walletAddress):session.current
      const result=await api({action:'status',quoteToken:value.quoteToken,txHash:value.txHash,...(active?{circleUserToken:active.userToken}:{})})
      if(currentOwner.current!==owner)return
      if(result.status==='completed'){save(null);setQuoted(null);setAmount('');setNotice('USDT arrived in your '+pocketBridgeNetworkLabel(value.quote.destination)+' wallet.');void props.refresh();props.onActivity()}
      else if(result.status==='failed'){save(null);setQuoted(null);setError('The source transaction did not complete. You can request a new quote.')}
      else if(result.status==='not_submitted'&&Date.now()>value.quote.expiresAt+60000){save(null);setQuoted(null);setNotice('This quote expired without a submitted bridge. Request a new quote.')}
      else{save({...value,...(result.txHash?{txHash:result.txHash}:{}),...(result.challengeId?{challengeId:result.challengeId}:{})});setNotice(result.status==='needs_attention'?'This bridge needs review. Contact support before sending again.':'Bridge in progress.');props.onActivity()}
    }catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}
  }
  async function prepare(){if(!quoted)throw Error('Review a quote first.');session.current=await props.getSession(source,quoted.quote.walletAddress)}
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
      const result=await executeCircleEvmEmailChallenge({session:session.current,challengeId:response.challengeId,pendingMessage:'Your bridge is saved. Check its status before retrying.'})
      if(currentOwner.current!==owner)return
      if(result.transactionHash){saved={...saved,txHash:result.transactionHash};save(saved)}
      setNotice('Bridge submitted.');props.onActivity();void props.refresh()
    }catch(e){setError(saved?'Your bridge is saved. Check its status before retrying.':(e as Error).message)}finally{lock.current=false;setBusy(false)}
    if(saved&&currentOwner.current===owner)void check(saved,false)
  }
  const checkRef=useRef(check);checkRef.current=check
  useEffect(()=>{if(!pending)return;const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&!lock.current&&pending.txHash)void checkRef.current(pending,false)},10000);return()=>clearInterval(timer)},[pending])
  const balance=props.balances.find(row=>row.key===source)
  return <section className="space-y-5 rounded-[26px] border border-gray-100 bg-white p-5 dark:border-[#262626] dark:bg-[#0D0D0D]">
    {pending?<><p className="text-sm font-semibold">{pending.quote.amount} USDT</p><p className="text-xs text-gray-500">{pocketBridgeNetworkLabel(pending.quote.source)} to {pocketBridgeNetworkLabel(pending.quote.destination)}</p><button type="button" disabled={busy} onClick={()=>void check(pending)} className="min-h-12 w-full rounded-full bg-gray-200 text-sm font-semibold text-gray-900 disabled:opacity-60 dark:bg-[#262626] dark:text-white">{busy?'Checking bridge':'Check bridge status'}</button></>:<>
      <div className="grid grid-cols-2 gap-3"><div><p className="mb-2 text-xs text-gray-500">From</p><PocketSelect showNetworkBalances={false} value={source} disabled={busy||loading} ariaLabel="USDT source network" options={NETWORKS.map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} onChange={value=>{invalidate();setSource(value as Network);if(value===destination)setDestination(NETWORKS.find(n=>n!==value)!);setAmount('')}}/></div><div><p className="mb-2 text-xs text-gray-500">To</p><PocketSelect showNetworkBalances={false} value={destination} disabled={busy||loading} ariaLabel="USDT destination network" options={NETWORKS.filter(n=>n!==source).map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} onChange={value=>{invalidate();setDestination(value as Network)}}/></div></div>
      <div className="flex justify-between text-sm"><span className="text-gray-500">Available</span><span>{balance?.usdt!==undefined&&!balance.usdtStale?formatPocketDisplayAmount(balance.usdt)+' USDT':'—'}</span></div>
      <label className="block text-xs text-gray-500">Amount<input aria-label="USDT bridge amount" inputMode="decimal" value={amount} disabled={busy||loading} onChange={event=>{invalidate();setAmount(event.target.value)}} placeholder="0.00" className="mt-2 w-full rounded-2xl border border-gray-200 bg-transparent px-4 py-4 text-base font-semibold text-gray-900 dark:border-[#262626] dark:text-white"/></label>
      {quoted&&<div className="space-y-2 text-xs"><div className="flex justify-between"><span>You receive</span><b>{quoted.quote.receive} USDT</b></div><div className="flex justify-between"><span>Minimum received</span><b>{quoted.quote.minimumReceive} USDT</b></div><div className="flex justify-between"><span>Bridge fee · included</span><b>{quoted.quote.fee} USDT</b></div>{!quoted.sufficientBalance&&<p>Insufficient USDT on {pocketBridgeNetworkLabel(source)}.</p>}</div>}
      {!quoted?<button type="button" disabled={busy||loading||(!recoveryFailed&&(!Number.isFinite(Number(amount))||Number(amount)<=0))} onClick={()=>recoveryFailed?setReload(value=>value+1):void quote()} className="min-h-12 w-full rounded-full bg-gray-200 text-sm font-semibold text-gray-900 disabled:opacity-50 dark:bg-[#262626] dark:text-white">{busy?'Getting live quote':loading?'Loading':recoveryFailed?'Try again':'Continue'}</button>:<PocketSlideAction approvalRequired={false} onPrepare={prepare} onApprovalBusyChange={props.onBusyChange} status={busy?'pending':'idle'} disabled={busy||!quoted.sufficientBalance} onConfirm={()=>void execute()} labels={{idle:'Confirm bridge',disabled:'Insufficient balance',pending:'Preparing bridge',submitted:'Bridge submitted',successful:'Bridged'}}/>}
    </>}
    {notice&&<p role="status" className="text-center text-xs text-gray-500">{notice}</p>}{error&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
  </section>
}
