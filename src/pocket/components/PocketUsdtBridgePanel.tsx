import {useCallback,useEffect,useRef,useState} from 'react'
import {executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {pocketBridgeNetworkLabel} from '../lib/pocketBridgeNetworks'
import PocketBridgeForm from './PocketBridgeForm'
import PocketTransactionSheet from './PocketTransactionSheet'
import PocketSlideAction from './PocketSlideAction'
import PocketFundingAction from './PocketFundingAction'
import {Loader2} from './PocketIcons'


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
  const [quoting,setQuoting]=useState(false)
  const [result,setResult]=useState<{quote:Quote;state:'successful'|'failed';txHash?:string;destinationTxHash?:string}|null>(null)
  const lock=useRef(false),version=useRef(0),session=useRef<CircleEvmEmailSession|null>(null),currentOwner=useRef(props.owner)
  currentOwner.current=props.owner
  const key='pocket:usdt-bridge:v1:'+encodeURIComponent(props.owner)
  const save=(value:Pending|null)=>{if(value)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);setPending(value)}
  const api=useCallback(async(body?:Record<string,unknown>,timeoutMs=30000)=>{
    const token=await props.getAccessToken();if(!token)throw Error('Sign in to bridge stablecoins.')
    const response=await fetch(pocketApiUrl('/api/pocket/usdt-bridge'),{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(body?timeoutMs:8000)})
    const data=await response.json().catch(()=>({ok:false,error:'Bridge service is unavailable.'}));if(response.status===404)throw Error('USDT bridging is updating. Try again shortly.');if(!response.ok||!data.ok)throw Object.assign(Error(data.error?.message||data.error||'Bridge request failed.'),{retryable:response.status>=500||response.status===429});return data
  },[props.getAccessToken])
  useEffect(()=>{let disposed=false;setLoading(true);setRecoveryFailed(false);setError('');setPending(null);session.current=null
    const owner=props.owner
    void (async()=>{
      try{const stored=localStorage.getItem(key);if(stored){const p=JSON.parse(stored);if(!p.quoteToken||!p.quote?.id)throw Error('Saved bridge details could not be read. Contact support before retrying.');if(!disposed)setPending(p)}
        for(let attempt=0;attempt<5;attempt++){
          try{const data=await api();if(disposed||currentOwner.current!==owner)return;if(data.pending?.length)save(data.pending[0]);setLoading(false);break}
          catch(e){if(disposed)return;const transient=(e as {retryable?:boolean}).retryable||e instanceof TypeError||(e as Error).name==='TimeoutError';if(!transient||attempt===4)throw e;await new Promise(resolve=>window.setTimeout(resolve,Math.min(8000,1000*2**attempt)));if(disposed)return}
        }
      }catch(e){if(!disposed){setError((e as Error).message);setRecoveryFailed(true);setLoading(false)}}
    })();return()=>{disposed=true;version.current++}
  },[props.owner,api,key,reload])
  useEffect(()=>{props.onBusyChange(busy||preparing);return()=>props.onBusyChange(false)},[busy,preparing,props.onBusyChange])
  useEffect(()=>{setQuoteExpired(false);if(!quoted)return;const timer=window.setTimeout(()=>setQuoteExpired(true),Math.max(0,quoted.quote.expiresAt-Date.now()));return()=>clearTimeout(timer)},[quoted])
  const invalidate=()=>{version.current++;setQuoted(null);setQuoting(false);setError('');setNotice('');session.current=null}
  async function quote(){
    if(document.visibilityState!=='visible'||lock.current||busy||preparing||pending||loading||recoveryFailed)return
    if(!/^\d+(\.\d{1,6})?$/.test(amount)||Number(amount)<=0)return
    const requestVersion=++version.current,deadline=Date.now()+30000;setQuoting(true);setError('');setQuoted(null)
    try{
      for(let attempt=0;attempt<3;attempt++){
        try{const data=await api({action:'quote',source,destination,amount},Math.max(1,deadline-Date.now()));if(requestVersion===version.current)setQuoted(data);break}
        catch(e){if(requestVersion!==version.current)return;const transient=(e as {retryable?:boolean}).retryable||e instanceof TypeError||(e as Error).name==='TimeoutError';if(!transient||attempt===2||Date.now()+1000*2**attempt>=deadline)throw e;await new Promise(resolve=>window.setTimeout(resolve,1000*2**attempt));if(requestVersion!==version.current)return}
      }
    }catch(e){if(requestVersion===version.current)setError((e as Error).message)}finally{if(requestVersion===version.current)setQuoting(false)}
  }
  const quoteRef=useRef(quote);quoteRef.current=quote
  useEffect(()=>{
    if(loading||recoveryFailed||pending)return
    const timer=window.setTimeout(()=>void quoteRef.current(),450)
    return()=>{clearTimeout(timer);version.current++}
  },[amount,source,destination,loading,recoveryFailed,props.owner,pending?.quote.id])
  useEffect(()=>{if(quoteExpired&&!preparing&&!pending)void quoteRef.current()},[quoteExpired,preparing,pending?.quote.id])
  useEffect(()=>{
    const resume=()=>{
      if(document.visibilityState!=='visible'){if(quoting){version.current++;setQuoting(false)}return}
      if(pending||busy||preparing||loading||quoting)return
      if(recoveryFailed){setReload(value=>value+1);return}
      if(!quoted||quoted.quote.expiresAt<=Date.now())void quoteRef.current()
    }
    document.addEventListener('visibilitychange',resume)
    window.addEventListener('online',resume)
    return()=>{document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume)}
  },[quoted,quoting,pending,busy,preparing,loading,recoveryFailed])
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
  const locked=busy||preparing||Boolean(pending)
  const validAmount=/^\d+(\.\d{1,6})?$/.test(amount)&&Number(amount)>0
  return <>
    <PocketBridgeForm asset="USDT" disabled={locked} source={source} destination={destination} sources={NETWORKS.map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} destinations={NETWORKS.filter(n=>n!==source).map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} onSource={value=>{invalidate();setSource(value as Network);if(value===destination)setDestination(NETWORKS.find(n=>n!==value)!);setAmount('')}} onDestination={value=>{invalidate();setDestination(value as Network)}} balance={balance?.usdt} amount={amount} onAmount={value=>{invalidate();setAmount(value)}} maxDisabled={balance?.usdt===undefined||balance.usdtStale} onMax={()=>{invalidate();setAmount(Math.max(0,balance?.usdt||0).toFixed(6).replace(/\.?0+$/,''))}} quote={quoted&&!pending?quoted.quote:null}>
      <PocketFundingAction flow="bridge" asset={!pending&&(quoted?.sufficientBalance===false||(balance?.usdt!==undefined&&!balance.usdtStale&&Number(amount)>balance.usdt))?'USDT':null} network={source} locked={locked} onReturn={async()=>{await props.refresh();await quote()}} onCancel={()=>{invalidate();setAmount('')}}>
      {pending?<button type="button" className="pocket-cta-primary w-full" disabled={!pending.needsAttention} aria-busy={!pending.needsAttention} onClick={()=>void check(pending)}>{!pending.needsAttention&&<Loader2 className="h-4 w-4 animate-spin"/>}<span>{pending.needsAttention?'Retry status check':pending.sourceConfirmed?'Arriving on '+pocketBridgeNetworkLabel(pending.quote.destination):'Bridging USDT'}</span></button>
      :recoveryFailed||(!quoted&&error&&!quoting)?<button type="button" className="pocket-cta-primary w-full" onClick={()=>recoveryFailed?setReload(value=>value+1):void quote()}>Try again</button>
      :<PocketSlideAction key={quoted?.quote.id||'quote'} approvalRequired={false} onPrepare={prepare} onApprovalBusyChange={setPreparing} status={busy?'pending':'idle'} disabled={loading||locked||quoting||!quoted||quoteExpired||!quoted.sufficientBalance} onConfirm={()=>void execute()} labels={{idle:'Confirm bridge',disabled:!validAmount?'Enter bridge amount':loading||quoting||!quoted||quoteExpired?'Getting live quote':'Insufficient balance',pending:'Preparing bridge',submitted:'Bridging USDT',successful:'Bridge successful'}}/>}
      </PocketFundingAction>
      {notice&&<p role="status" className="text-center text-xs text-gray-500">{notice}</p>}{error&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
    </PocketBridgeForm>
    {result&&<PocketTransactionSheet title="Bridge stablecoins" state={result.state} statusLabel={result.state==='successful'?'Bridge successful':'Bridge failed'} amount={result.quote.amount+' USDT'} detailsRows={[
      ['Asset','USDT'],['From',pocketBridgeNetworkLabel(result.quote.source)],['To',pocketBridgeNetworkLabel(result.quote.destination)],['Bridge fee',result.quote.fee+' USDT'],...(result.txHash?[['Transaction',result.txHash] as [string,string]]:[]),...(result.destinationTxHash?[['Destination transaction',result.destinationTxHash] as [string,string]]:[])
    ]} onDone={()=>setResult(null)}/>}
  </>
}
