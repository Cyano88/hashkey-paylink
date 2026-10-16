import {beginPocketOperation,endPocketOperation,trackPocketOperation,migratePocketOperations} from '../lib/pocketOperationRecovery'
import { pocketPricingMessage } from '../lib/pocketPricingMessage'
import {useCallback,useEffect,useRef,useState} from 'react'
import {executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {pocketBridgeNetworkLabel} from '../lib/pocketBridgeNetworks'
import PocketBridgeForm from './PocketBridgeForm'
import PocketSlideAction from './PocketSlideAction'
import PocketFundingAction from './PocketFundingAction'
import {signCircleSolanaTransaction} from '../../lib/circleSolanaEmailWallet'
import type {PocketSolanaEmailSession} from '../controllers/usePocketWalletController'


const NETWORKS=['base','arbitrum','ethereum','polygon','solana'] as const
type Network=typeof NETWORKS[number]
type Quote={total?:string;destinationAddress?:string;networkFeeUnits?:string;id:string;source:Network;destination:Network;walletAddress:string;amount:string;receive:string;minimumReceive:string;fee:string;expiresAt:number}
type Pending={quote:Quote;quoteToken:string;signedTransaction?:string;challengeId?:string;txHash?:string;sourceConfirmed?:boolean;needsAttention?:boolean;awaitingApproval?:boolean;requiresWalletSession?:boolean}
type Props={initialSource?:Network;initialDestination?:Network;xlayerEnabled?:boolean;onXLayer?():void;onTracked?(id:string):void;ensureWallet(network:Network):Promise<{address:string}|null>;owner:string;getAccessToken():Promise<string|null>;getSession(network:Exclude<Network,'solana'>,address:string):Promise<CircleEvmEmailSession>;getSolanaSession(address:string):Promise<PocketSolanaEmailSession>;onBusyChange(value:boolean):void;onActivity():void;refresh():Promise<unknown>;balances:Array<{key:string;usdt?:number;usdtStale?:boolean}>}
export default function PocketUsdtBridgePanel(props:Props){
  const [source,setSource]=useState<Network>(props.initialSource||'arbitrum'),[destination,setDestination]=useState<Network>(props.initialDestination||'base')
  const [amount,setAmount]=useState(''),[quoted,setQuoted]=useState<(Pending&{sufficientBalance:boolean})|null>(null)
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [recoveryFailed,setRecoveryFailed]=useState(false),[reload,setReload]=useState(0)
  const [preparing,setPreparing]=useState(false),[quoteExpired,setQuoteExpired]=useState(false)
  const [quoting,setQuoting]=useState(false)
  const [solanaEnabled,setSolanaEnabled]=useState(false),[solanaDestinationEnabled,setSolanaDestinationEnabled]=useState(false)
  const executionError=useRef('');const quotePaused=useRef(false);const maxRequested=useRef(false);const lock=useRef(false),version=useRef(0),session=useRef<CircleEvmEmailSession|null>(null),currentOwner=useRef(props.owner)
  currentOwner.current=props.owner
  const key='pocket:usdt-bridge:v1:'+encodeURIComponent(props.owner)
  const pendingRef=useRef<Pending|null>(null)
  pendingRef.current=pending
  const save=(value:Pending|null)=>{pendingRef.current=value;if(value)trackPocketOperation(props.owner,'bridge',value);else localStorage.removeItem(key);setPending(value)}
  const api=useCallback(async(body?:Record<string,unknown>,timeoutMs=30000)=>{
    const token=await props.getAccessToken();if(!token)throw Error('Sign in to bridge stablecoins.')
    const response=await fetch(pocketApiUrl('/api/pocket/usdt-bridge'),{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(body?timeoutMs:8000)})
    const data=await response.json().catch(()=>({ok:false,error:'Bridge service is unavailable.'}));if(response.status===404)throw Error('USDT bridging is updating. Try again shortly.');if(!response.ok||!data.ok)throw Object.assign(Error(data.error?.message||data.error||'Bridge request failed.'),{submissionRejected:body?.action==='execute'&&[400,401,403,409,422].includes(response.status),retryable:response.status>=500||response.status===429,maximumAmountUnits:data.maximumAmountUnits});return data
  },[props.getAccessToken])
  useEffect(()=>{let disposed=false;setLoading(true);setRecoveryFailed(false);setError('');setPending(null);session.current=null
    const owner=props.owner
    void (async()=>{
      try{migratePocketOperations(owner)
        for(let attempt=0;attempt<5;attempt++){
          try{const data=await api();if(disposed||currentOwner.current!==owner)return;setSolanaEnabled(data.solanaSourceEnabled===true);setSolanaDestinationEnabled(data.solanaDestinationEnabled===true);for(const remote of data.pending||[])trackPocketOperation(owner,'bridge',remote);setLoading(false);break}
          catch(e){if(disposed)return;const transient=(e as {retryable?:boolean}).retryable||e instanceof TypeError||(e as Error).name==='TimeoutError';if(!transient||attempt===4)throw e;await new Promise(resolve=>window.setTimeout(resolve,Math.min(8000,1000*2**attempt)));if(disposed)return}
        }
      }catch(e){if(!disposed){setError((e as Error).message);setRecoveryFailed(true);setLoading(false)}}
    })();return()=>{disposed=true;version.current++}
  },[props.owner,api,key,reload])
  useEffect(()=>{props.onBusyChange(busy||preparing);return()=>props.onBusyChange(false)},[busy,preparing,props.onBusyChange])
  useEffect(()=>{setQuoteExpired(false);if(!quoted)return;const timer=window.setTimeout(()=>setQuoteExpired(true),Math.max(0,quoted.quote.expiresAt-Date.now()));return()=>clearTimeout(timer)},[quoted])
  const invalidate=()=>{quotePaused.current=false;executionError.current='';maxRequested.current=false;version.current++;setQuoted(null);setQuoting(false);setError('');setNotice('');session.current=null}
  const balance=props.balances.find(row=>row.key===source)
  const exceedsBalance=balance?.usdt!==undefined&&!balance.usdtStale&&Number(amount)>balance.usdt
  async function quote(manual=false){
    if(manual){quotePaused.current=false;executionError.current=''}
    if(quotePaused.current)return
    if(document.visibilityState!=='visible'||lock.current||busy||preparing||pending||loading||recoveryFailed)return
    if(!/^\d+(\.\d{1,6})?$/.test(amount)||Number(amount)<=0)return
    if(exceedsBalance){version.current++;setQuoted(null);setQuoting(false);setError('');return}
    const requestVersion=++version.current,deadline=Date.now()+30000;setQuoting(true);setError('')
    try{
      const wallet=await props.ensureWallet(source)
      if(!wallet)throw Error('Open your source wallet to continue.')
      await props.ensureWallet(destination)
      const active=source==='solana'?null:await props.getSession(source,wallet.address)
      if(requestVersion!==version.current)return
      session.current=active
      for(let attempt=0;attempt<3;attempt++){
        try{const data=await api({action:'quote',source,destination,amount,circleUserToken:active?.userToken},Math.max(1,deadline-Date.now()));if(requestVersion===version.current)setQuoted(data);break}
        catch(e){if(requestVersion!==version.current)return;const transient=(e as {retryable?:boolean}).retryable||e instanceof TypeError||(e as Error).name==='TimeoutError';if(!transient||attempt===2||Date.now()+1000*2**attempt>=deadline)throw e;await new Promise(resolve=>window.setTimeout(resolve,1000*2**attempt));if(requestVersion!==version.current)return}
      }
    }catch(e){if(requestVersion===version.current){const maximum=(e as {maximumAmountUnits?:string}).maximumAmountUnits;if(maxRequested.current&&maximum&&/^[0-9]+$/.test(maximum)&&Number(maximum)>0&&Number(maximum)/1e6<Number(amount)){maxRequested.current=false;setAmount((Number(maximum)/1e6).toFixed(6))}else setError((e as Error).message)}}finally{if(requestVersion===version.current)setQuoting(false)}
  }
  const quoteRef=useRef(quote);quoteRef.current=quote
  useEffect(()=>{
    if(loading||recoveryFailed||pending)return
    const timer=window.setTimeout(()=>void quoteRef.current(),450)
    return()=>{clearTimeout(timer);version.current++}
  },[amount,source,destination,loading,recoveryFailed,props.owner,pending?.quote.id,balance?.usdt,balance?.usdtStale])
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
  async function prepare(){
    setError('')
    try{
      if(!quoted||quoted.quote.expiresAt<=Date.now())throw Error('The amount needs updating. Continue to review it.')
      if(source==='solana')await props.getSolanaSession(quoted.quote.walletAddress)
      else session.current=await props.getSession(source,quoted.quote.walletAddress)
      if(quoted.quote.expiresAt<=Date.now())throw Error('The amount needs updating. Continue to review it.')
    }catch(e){session.current=null;setError((e as Error).message||'Could not prepare your wallet. Please try again.');throw e}
  }
  async function execute(){
    if(quoted?.quote.source==='solana'){await executeSolana(quoted);return}
    if(lock.current||!quoted||!session.current||!quoted.sufficientBalance)return
    if(quoted.quote.expiresAt<=Date.now()){setQuoted(null);setError('The amount needs updating. Continue to review it.');return}
    lock.current=true;setBusy(true);setError('');executionError.current='';let saved:Pending|null=null
    const owner=props.owner
    beginPocketOperation(owner,quoted.quote.id)
    try{
      saved={quote:quoted.quote,quoteToken:quoted.quoteToken};save(saved)
      const response=await api({action:'execute',quoteToken:saved.quoteToken,circleUserToken:session.current.userToken})
      if(currentOwner.current!==owner)return
      saved={...saved,challengeId:response.challengeId};save(saved)
      const result=await executeCircleEvmEmailChallenge({session:session.current,challengeId:response.challengeId,approval:{asset:'USDT',amount:saved.quote.amount,totalAmount:saved.quote.total,purpose:'bridge'},pendingMessage:'Your bridge is saved. We will update it automatically.'})
      if(currentOwner.current!==owner)return
      if(result.transactionHash){saved={...saved,txHash:result.transactionHash};save(saved)}
      setNotice('');props.onActivity();void props.refresh()
    }catch(e){if(saved&&!saved.challengeId&&(e as {submissionRejected?:boolean}).submissionRejected)trackPocketOperation(owner,'bridge',saved,'failed');executionError.current=(e as Error).message;setError(executionError.current)}finally{if(saved)endPocketOperation(owner,saved.quote.id);lock.current=false;setBusy(false)}
    if(saved&&currentOwner.current===owner){setPending(null);pendingRef.current=null;setQuoted(null);setAmount('');setError('');props.onActivity();props.onTracked?.(saved.quote.id)}
  }
  async function executeSolana(value:Pending){
    if(lock.current)return
    lock.current=true;setBusy(true);setError('');executionError.current='';const owner=props.owner
    let saved:Pending={...value}
    beginPocketOperation(owner,saved.quote.id)
    try{
      save(saved)
      if(!saved.signedTransaction){
        const active=await props.getSolanaSession(value.quote.walletAddress),accessToken=await props.getAccessToken()
        if(!accessToken)throw Error('Sign in to continue.')
        const prepared=await api({action:'execute',quoteToken:value.quoteToken})
        if(currentOwner.current!==owner)return
        const signedTransaction=await signCircleSolanaTransaction({session:active,rawTransaction:prepared.transaction,memo:'Pocket USDT bridge',bridge:{totalAmount:value.quote.total,asset:'USDT',bridgeId:prepared.bridgeId,destination:value.quote.destination as 'base'|'arbitrum',destinationAddress:value.quote.destinationAddress!,amount:value.quote.amount,accessToken}})
        if(currentOwner.current!==owner)return
        saved={...saved,signedTransaction};save(saved)
      }
      await api({action:'submit',quoteToken:saved.quoteToken,transaction:saved.signedTransaction})
    }catch(e){if(!saved.signedTransaction)trackPocketOperation(owner,'bridge',saved,'failed');if(currentOwner.current===owner){executionError.current=(e as Error).message;setError(executionError.current)}}finally{endPocketOperation(owner,saved.quote.id);lock.current=false;setBusy(false)}
    if(currentOwner.current===owner){setPending(null);pendingRef.current=null;setQuoted(null);setAmount('');setError('');props.onActivity();props.onTracked?.(saved.quote.id)}
  }
  const shortfall=!pending&&(quoted?.sufficientBalance===false||exceedsBalance)
  const locked=busy||preparing||Boolean(pending)
  const validAmount=/^\d+(\.\d{1,6})?$/.test(amount)&&Number(amount)>0
  const sources=NETWORKS.filter(n=>n!=='solana'||solanaEnabled||pending?.quote.source==='solana')
  const destinations=source==='solana'?(['base','arbitrum'] as Network[]):NETWORKS.filter(n=>n!==source&&(n!=='solana'||(source==='arbitrum'&&solanaDestinationEnabled)||pending?.quote.destination==='solana'))
  return <>
    <PocketBridgeForm amountHint={shortfall?'Insufficient funds':undefined} quoteLoading={quoting} asset="USDT" disabled={locked} source={source} destination={destination} sources={sources.map(value=>({value,label:pocketBridgeNetworkLabel(value)}))} destinations={[...destinations.map(value=>({value,label:pocketBridgeNetworkLabel(value)})),...(props.xlayerEnabled&&source==='base'?[{value:'xlayer',label:'X Layer'}]:[])]} onSource={value=>{invalidate();setSource(value as Network);if(value===destination||(destination==='solana'&&value!=='arbitrum')||(value==='solana'&&!['base','arbitrum'].includes(destination)))setDestination(value==='base'?'arbitrum':'base');setAmount('')}} onDestination={value=>{invalidate();if(value==='xlayer'){props.onXLayer?.();return}setDestination(value as Network)}} balance={balance?.usdt} amount={amount} onAmount={value=>{invalidate();setAmount(value)}} maxDisabled={balance?.usdt===undefined} onMax={()=>{invalidate();maxRequested.current=true;setAmount(Math.max(0,(balance?.usdt||0)-Number(quoted?.quote.networkFeeUnits||0)/1e6).toFixed(6).replace(/\.?0+$/,''))}} quote={pending?.quote||quoted?.quote||null}>
      <PocketFundingAction showHint={false} flow="bridge" asset={shortfall?'USDT':null} network={source} locked={locked} onReturn={async()=>{await props.refresh();await quote()}} onCancel={()=>{invalidate();setAmount('')}}>
      {recoveryFailed||(!quoted&&error&&!quoting)?<button type="button" className="pocket-cta-primary w-full" onClick={()=>recoveryFailed?setReload(value=>value+1):void quote(true)}>Try again</button>
      :<PocketSlideAction loadingContent={loading||quoting} approvalRequired={false} onPrepare={prepare} onApprovalBusyChange={setPreparing} status={busy?'pending':'idle'} disabled={loading||locked||quoting||!quoted||quoteExpired||!quoted.sufficientBalance} onConfirm={()=>void execute()} labels={{idle:'Confirm bridge',disabled:!validAmount?'Enter bridge amount':loading||quoting?'Updating amount':!quoted||quoteExpired?'Amount unavailable':'Insufficient balance',pending:'Preparing bridge',submitted:'Bridging USDT',successful:'Bridge successful'}}/>}
      </PocketFundingAction>
      {notice&&<p role="status" className="text-center text-xs text-gray-500">{notice}</p>}{error&&!shortfall&&<p role="alert" className="text-xs text-red-600 dark:text-red-300">{pocketPricingMessage(error)}</p>}
    </PocketBridgeForm>
  </>
}
