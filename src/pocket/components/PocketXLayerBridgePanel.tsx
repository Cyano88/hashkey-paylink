import {useEffect,useRef,useState} from 'react'
import {executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import PocketBridgeForm from './PocketBridgeForm'
import PocketSlideAction from './PocketSlideAction'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {POCKET_BRIDGE_NETWORKS,pocketBridgeNetworkLabel} from '../lib/pocketBridgeNetworks'
import {beginPocketOperation,endPocketOperation,trackPocketOperation,readPocketOperations,POCKET_OPERATIONS_UPDATED} from '../lib/pocketOperationRecovery'
import type {PocketBridgeNetwork} from '../api/pocketBridgeClient'

type Quote={id:string;rail:'xlayer';asset:'USDC'|'USDT';refundOptions?:Array<{network:string;asset:'USDC'|'USDT';recipient:string}>;source:'base';destination:'xlayer';walletAddress:string;amount:string;total:string;receive:string;minimumReceive:string;fee:string;networkFeeUnits:string;expiresAt:number}
type Pending={quote:Quote;quoteToken:string;challengeId?:string;txHash?:string}
export async function xlayerBridgeRequest(getAccessToken:()=>Promise<string|null>,body?:Record<string,unknown>){
 const token=await getAccessToken();if(!token)throw Error('Sign in to bridge stablecoins.')
 const res=await fetch(pocketApiUrl('/api/pocket/xlayer-bridge'),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000),cache:'no-store'})
 const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||'Bridge is unavailable. Try again.');return data
}
type Props={asset?:'USDC'|'USDT';owner:string;balance?:number;getAccessToken():Promise<string|null>;ensureWallet(network:'base'):Promise<{address:string}|null>;getSession(network:'base',address:string):Promise<CircleEvmEmailSession>;onBusyChange(busy:boolean):void;onTracked(id:string,asset?:'USDC'|'USDT'):void;onDestination(network:PocketBridgeNetwork):void;onSource(network:PocketBridgeNetwork):void;refresh():Promise<unknown>}
export default function PocketXLayerBridgePanel(p:Props){
 const asset=p.asset||'USDC'
 const [amount,setAmount]=useState(''),[quoted,setQuoted]=useState<(Pending&{sufficientBalance:boolean})|null>(null),[quoting,setQuoting]=useState(false),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
 const [pending,setPending]=useState<Pending|null>(null),[pendingState,setPendingState]=useState('')
 const activeAttempt=useRef<string|null>(null)
 const session=useRef<CircleEvmEmailSession|null>(null),version=useRef(0),mounted=useRef(true),lock=useRef(false),owner=useRef(p.owner)
 owner.current=p.owner
 const current=(account:string)=>mounted.current&&owner.current===account
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;version.current++}},[])
 useEffect(()=>{p.onBusyChange(busy||preparing);return()=>p.onBusyChange(false)},[busy,preparing,p.onBusyChange])
 useEffect(()=>{
  activeAttempt.current=null
  const load=()=>{
   const records=readPocketOperations(p.owner)
   const finished=records.find(r=>r.pending.quote.id===activeAttempt.current&&['completed','failed','refunded'].includes(r.state))
   if(finished){activeAttempt.current=null;p.onTracked(finished.pending.quote.id,finished.pending.quote.asset)}
   const saved=records.find(r=>r.pending.quote.rail==='xlayer'&&!['completed','failed','refunded'].includes(r.state))
   setPending(saved?.pending||null);setPendingState(saved?.state||'')
  }
  load();window.addEventListener(POCKET_OPERATIONS_UPDATED,load);return()=>window.removeEventListener(POCKET_OPERATIONS_UPDATED,load)
 },[p.owner])
 useEffect(()=>{
  if(busy||preparing)return
  const n=++version.current,account=p.owner
  setQuoted(null);session.current=null;setError('');setQuoting(false)
  if(pending||busy||!/^\d+(\.\d{1,6})?$/.test(amount)||Number(amount)<=0||p.balance!==undefined&&Number(amount)>p.balance)return
  setQuoting(true)
  const timer=window.setTimeout(()=>void(async()=>{
   try{
    const wallet=await p.ensureWallet('base');if(!wallet)throw Error('Open your Base wallet to continue.')
    if(n!==version.current||!current(account))return
    const active=await p.getSession('base',wallet.address)
    if(n!==version.current||!current(account))return
    const result=await xlayerBridgeRequest(p.getAccessToken,{action:'quote',source:'base',destination:'xlayer',asset,amount,circleUserToken:active.userToken})
    if(n!==version.current||!current(account))return
    session.current=active;setQuoted(result)
   }catch(e){if(n===version.current&&current(account))setError((e as Error).message)}finally{if(n===version.current&&current(account))setQuoting(false)}
  })(),450)
  return()=>{clearTimeout(timer);version.current++}
 },[amount,asset,p.owner,p.balance,refresh,pending?.quote.id])
 useEffect(()=>{if(!quoted||busy||preparing)return;const timer=window.setTimeout(()=>setRefresh(n=>n+1),Math.max(0,quoted.quote.expiresAt-Date.now()));return()=>clearTimeout(timer)},[quoted,busy,preparing])
 async function prepare(){
  try{
   if(!quoted||quoted.quote.expiresAt<=Date.now())throw Error('Refresh the bridge amount before continuing.')
   const account=p.owner,active=await p.getSession('base',quoted.quote.walletAddress)
   if(!current(account)||!quoted||quoted.quote.expiresAt<=Date.now())throw Error('Refresh the bridge amount before continuing.')
   session.current=active
  }catch(e){setError((e as Error).message);throw e}
 }
 const changeAmount=(value:string)=>{version.current++;setQuoted(null);setError('');setAmount(value)}
 async function execute(savedValue?:Pending){
  if(lock.current||(!savedValue&&(!quoted||!quoted.sufficientBalance||!session.current)))return
  const value=savedValue||quoted!,account=p.owner
  if(!savedValue&&value.quote.expiresAt<=Date.now()){setRefresh(n=>n+1);return}
  activeAttempt.current=value.quote.id
  lock.current=true;setBusy(true);setError('');beginPocketOperation(account,value.quote.id)
  let saved:Pending={...value}
  try{
   // Persist before the network call. A lost response must not invite a second debit.
   trackPocketOperation(account,'bridge',saved)
   const active=savedValue?await p.getSession('base',saved.quote.walletAddress):session.current!
   if(!current(account))return
   const result=await xlayerBridgeRequest(p.getAccessToken,{action:savedValue?'resume':'execute',quoteToken:saved.quoteToken,circleUserToken:active.userToken})
   if(!current(account))return
   if(!result.challengeId)return
   saved={...saved,challengeId:result.challengeId};trackPocketOperation(account,'bridge',saved)
   const approval=await executeCircleEvmEmailChallenge({session:active,challengeId:result.challengeId,approval:{asset:saved.quote.asset,amount:saved.quote.amount,totalAmount:saved.quote.total,purpose:'bridge'},pendingMessage:'Your bridge is saved. We will update it automatically.'})
   if(!current(account))return
   if(approval.transactionHash){saved={...saved,txHash:approval.transactionHash};trackPocketOperation(account,'bridge',saved)}
   setAmount('');setQuoted(null);void p.refresh()
  }catch(e){if(current(account))setError((e as Error).message)}finally{endPocketOperation(account,value.quote.id);lock.current=false;if(current(account))setBusy(false)}
 }
 const shortfall=p.balance!==undefined&&Number(amount)>p.balance||quoted?.sufficientBalance===false
 return <PocketBridgeForm exactQuoteAmounts asset={pending?.quote.asset||asset} disabled={busy||preparing||!!pending} source="base" destination="xlayer" sources={POCKET_BRIDGE_NETWORKS.filter(n=>asset==='USDC'||!['arc','solana'].includes(n)).map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} destinations={[...POCKET_BRIDGE_NETWORKS.filter(n=>n!=='base'&&(asset==='USDC'||!['arc','solana'].includes(n))).map(value=>({value,label:pocketBridgeNetworkLabel(value)})),{value:'xlayer',label:'X Layer'}]} onSource={n=>p.onSource(n as PocketBridgeNetwork)} onDestination={n=>{if(n!=='xlayer')p.onDestination(n as PocketBridgeNetwork)}} balance={p.balance} amount={pending?.quote.amount||amount} onAmount={changeAmount} maxDisabled={p.balance===undefined} onMax={()=>changeAmount(Math.max(0,(p.balance||0)-Number(quoted?.quote.networkFeeUnits||0)/1e6).toFixed(6).replace(/\.?0+$/,''))} quote={pending?.quote||quoted?.quote} quoteLoading={quoting} amountHint={shortfall?'Insufficient funds':undefined}>
  {(pending?.quote||quoted?.quote)?.refundOptions?.some(r=>r.asset!==(pending?.quote||quoted?.quote)?.asset)&&<p className="text-xs text-gray-500 dark:text-gray-400">If this bridge cannot finish, your refund may arrive as USDC on X Layer.</p>}
  {pending&&activeAttempt.current===pending.quote.id&&!['awaiting_approval','needs_review'].includes(pendingState)?<PocketSlideAction approvalRequired={false} status={busy?'pending':'submitted'} disabled onConfirm={()=>{}} labels={{idle:'Confirm bridge',pending:'Preparing bridge',submitted:'Bridging '+pending.quote.asset,successful:'Bridge successful'}}/>:pending?<button className="pocket-cta-primary w-full" disabled={busy||preparing} onClick={()=>pendingState==='awaiting_approval'?void execute(pending):p.onTracked(pending.quote.id,pending.quote.asset)}>{busy?'Checking bridge':pendingState==='awaiting_approval'?'Continue approval':'View bridge progress'}</button>:error&&!quoted&&!quoting?<button className="pocket-cta-primary w-full" onClick={()=>setRefresh(n=>n+1)}>Try again</button>:<PocketSlideAction approvalRequired={false} onPrepare={prepare} onApprovalBusyChange={setPreparing} loadingContent={quoting} status={busy?'pending':'idle'} disabled={busy||preparing||quoting||!quoted||!quoted.sufficientBalance||quoted.quote.expiresAt<=Date.now()} onConfirm={()=>void execute()} labels={{idle:'Confirm bridge',disabled:shortfall?'Insufficient balance':quoting?'Updating amount':!amount?'Enter bridge amount':'Amount unavailable',pending:'Preparing bridge',submitted:'Bridging '+asset,successful:'Bridge successful'}}/>}
  {error&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
 </PocketBridgeForm>
}
