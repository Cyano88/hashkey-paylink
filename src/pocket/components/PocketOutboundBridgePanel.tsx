import {POCKET_XLAYER_MINIMUM_AMOUNT} from '../lib/pocketXLayerMinimum'
import {useEffect,useRef,useState} from 'react'
import {formatUnits,type Address} from 'viem'
import PocketBridgeForm from './PocketBridgeForm'
import PocketSlideAction from './PocketSlideAction'
import {quoteOutboundBridge,type OutboundBridgeReview} from '../api/pocketOutboundBridge'
import {SponsoredTransferNotSubmitted} from '../lib/pocketSponsoredRequest'
import {beginPocketOperation,endPocketOperation,readPocketOperations,trackPocketOperation,POCKET_OPERATIONS_UPDATED} from '../lib/pocketOperationRecovery'
import {POCKET_BRIDGE_NETWORKS,pocketBridgeNetworkLabel} from '../lib/pocketBridgeNetworks'
import type usePocketStockWallet from '../hooks/usePocketStockWallet'
type Props={owner:string;asset:'USDC'|'USDT';wallet:ReturnType<typeof usePocketStockWallet>;getAccessToken():Promise<string|null>;ensureWallet(network:'base'):Promise<{address:string}|null>;onSource(network:string):void;onBusyChange(value:boolean):void;onTracked(id:string,asset?:'USDC'|'USDT'):void;refresh():Promise<unknown>}
export default function PocketOutboundBridgePanel(p:Props){
 const [amount,setAmount]=useState(''),[review,setReview]=useState<OutboundBridgeReview|null>(null),[quoting,setQuoting]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[generation,refreshQuote]=useState(0),[pending,setPending]=useState<any>(null)
 const version=useRef(0),scope=useRef(p.owner+':'+p.wallet.address),mounted=useRef(true),locked=useRef(false),active=useRef<string|null>(null)
 scope.current=p.owner+':'+p.wallet.address
 const current=(key:string)=>mounted.current&&scope.current===key
 const units=p.wallet.balanceStale?undefined:p.asset==='USDC'?p.wallet.snapshot?.cash:p.wallet.snapshot?.usdt
 const balance=units==null?undefined:Number(formatUnits(units,6))
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;version.current++}},[])
 useEffect(()=>{p.onBusyChange(busy);return()=>p.onBusyChange(false)},[busy,p.onBusyChange])
 useEffect(()=>{
  const load=()=>{
   const records=readPocketOperations(p.owner).filter(r=>r.pending.quote.execution==='privy'&&r.pending.quote.walletAddress?.toLowerCase()===p.wallet.address?.toLowerCase())
   const finished=records.find(r=>r.pending.quote.id===active.current&&['completed','failed','refunded'].includes(r.state))
   if(finished){active.current=null;p.onTracked(finished.pending.quote.id,finished.pending.quote.asset);void p.wallet.refresh();void p.refresh()}
   setPending(records.find(r=>!['completed','failed','refunded'].includes(r.state))?.pending||null)
  }
  load();window.addEventListener(POCKET_OPERATIONS_UPDATED,load);return()=>window.removeEventListener(POCKET_OPERATIONS_UPDATED,load)
 },[p.owner,p.wallet.address])
 useEffect(()=>{
  const n=++version.current,key=scope.current;setReview(null);setError('');setQuoting(false)
  if(busy||pending||!p.wallet.address||!/^\d+(\.\d{1,6})?$/.test(amount)||Number(amount)<POCKET_XLAYER_MINIMUM_AMOUNT)return
  setQuoting(true)
  const timer=setTimeout(()=>void(async()=>{
   try{
    const destination=await p.ensureWallet('base');if(!destination)throw Error('Open your Base wallet to continue.')
    if(n!==version.current||!current(key))return
    const next=await quoteOutboundBridge({owner:p.wallet.address!,destination:destination.address as Address,asset:p.asset,amount},p.getAccessToken)
    if(n===version.current&&current(key))setReview(next)
   }catch(e){if(n===version.current&&current(key))setError((e as Error).message)}finally{if(n===version.current&&current(key))setQuoting(false)}
  })(),450)
  return()=>{clearTimeout(timer);version.current++}
 },[amount,p.asset,p.owner,p.wallet.address,generation,pending?.quote.id,busy])
 useEffect(()=>{if(!review||busy)return;const timer=setTimeout(()=>refreshQuote(n=>n+1),Math.max(0,review.quote.expiresAt-Date.now()));return()=>clearTimeout(timer)},[review,busy])
 const change=(value:string)=>{version.current++;setReview(null);setError('');setAmount(value)}
 // The Privy wallet hook owns preparation and PIN approval; do not run the registered Circle form preparer.
 const prepareOutbound=async()=>{}
 async function submit(){
  if(locked.current||!review||pending)return
  const approved=structuredClone(review),key=scope.current,owner=p.owner,saved={quote:approved.quote,quoteToken:approved.quoteToken}
  locked.current=true;setBusy(true);setError('');let persisted=false
  try{
   const result=await p.wallet.bridgeOutbound(approved,()=>{
    if(!current(key))throw Error('Your Pocket account changed.')
    beginPocketOperation(owner,approved.quote.id)
    try{trackPocketOperation(owner,'bridge',saved);persisted=true;active.current=approved.quote.id}catch(e){endPocketOperation(owner,approved.quote.id);throw e}
   })
   if(persisted&&result.hash)trackPocketOperation(owner,'bridge',{...saved,txHash:result.hash})
   if(current(key))setAmount('')
  }catch(e){
   if(persisted&&e instanceof SponsoredTransferNotSubmitted){active.current=null;trackPocketOperation(owner,'bridge',saved,'failed')}
   if(current(key))setError((e as Error).message)
  }finally{endPocketOperation(owner,approved.quote.id);locked.current=false;if(current(key)){setBusy(false);setReview(null)}}
 }
 const shortfall=!!review&&units!=null&&Number(review.quote.total)>Number(formatUnits(units,6)),q=pending?.quote||review?.quote
 return <PocketBridgeForm exactQuoteAmounts asset={pending?.quote.asset||p.asset} source="xlayer" destination="base" sources={[{value:'xlayer',label:'X Layer'},...POCKET_BRIDGE_NETWORKS.filter(n=>p.asset==='USDC'||!['arc','solana'].includes(n)).map(value=>({value,label:pocketBridgeNetworkLabel(value)}))]} destinations={[{value:'base',label:'Base'}]} onSource={p.onSource} onDestination={()=>{}} disabled={busy||!!pending} amount={pending?.quote.amount||amount} onAmount={change} balance={balance} maxDisabled={balance===undefined} onMax={()=>change(Math.max(0,(balance||0)-Number(review?.quote.networkFee||0)).toFixed(6).replace(/\.?0+$/,''))} quote={q} quoteLoading={quoting} amountHint={shortfall?'Insufficient funds':!pending&&Number(amount)>0&&Number(amount)<POCKET_XLAYER_MINIMUM_AMOUNT?'Minimum '+POCKET_XLAYER_MINIMUM_AMOUNT+' '+p.asset:undefined}>
  {pending&&active.current!==pending.quote.id?<button className="pocket-cta-primary w-full" onClick={()=>p.onTracked(pending.quote.id,pending.quote.asset)}>View bridge progress</button>:error&&!review&&!quoting&&!pending?<button className="pocket-cta-primary w-full" onClick={()=>refreshQuote(n=>n+1)}>Try again</button>:<PocketSlideAction approvalRequired={false} onPrepare={prepareOutbound} status={busy?'pending':pending?'submitted':'idle'} loadingContent={quoting} disabled={busy||!!pending||!review||shortfall||balance===undefined||review.quote.expiresAt<=Date.now()} onConfirm={()=>void submit()} labels={{idle:'Confirm bridge',disabled:shortfall?'Insufficient balance':quoting?'Updating amount':!amount?'Enter bridge amount':'Amount unavailable',pending:'Preparing bridge',submitted:'Bridging '+p.asset,successful:'Bridge successful'}}/>}
  {error&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
 </PocketBridgeForm>
}
