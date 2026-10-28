import {formatPocketAssetAmount} from '../pocket/lib/pocketAmountDisplay'
import {pocketApiUrl} from '../pocket/lib/pocketRoutes'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useAuthorizationSignature} from '@privy-io/react-auth'
import {formatUnits,parseUnits} from 'viem'
import BrowserCheckoutCard from '../components/BrowserCheckoutCard'
import BrowserPaymentResult from '../components/BrowserPaymentResult'
import DeveloperLoadingSkeleton from '../components/DeveloperLoadingSkeleton'
import usePocketIdentity from '../pocket/hooks/usePocketIdentity'
import usePocketEmbeddedWallet from '../pocket/hooks/usePocketEmbeddedWallet'
import PocketPaymentSecurityGate from '../pocket/components/PocketPaymentSecurityGate'
import {requestPocketPaymentApproval,takePocketPaymentApproval} from '../pocket/lib/pocketPaymentApproval'
import {bscPaymentRequest,validateBscPayment,type BscPaymentQuote} from '../pocket/lib/pocketBscPayment'
import {PRIVY_APP_ID} from '../lib/authMode'

export type BscCheckoutView={expiresAt?:string;id:string;amount:string;asset:string;merchantName:string;brandImageUrl?:string;title?:string;status:string}
type Operation={operationId:string;checkoutId:string;state:string;hash?:string;quote:BscPaymentQuote}
export default function BscCheckoutPage({checkout,returnUrl,securityManaged=false}:{checkout:BscCheckoutView;returnUrl?:string;securityManaged?:boolean}){
 const identity=usePocketIdentity()
 if(checkout.status==='paid')return <BrowserPaymentResult fullScreen state="successful" amount={formatPocketAssetAmount(checkout.amount,checkout.asset)+' '+checkout.asset} merchant={checkout.merchantName} returnUrl={returnUrl} detail="Payment received."/>
 const content=<Payment key={identity.user?.id||'guest'} checkout={checkout} returnUrl={returnUrl}/>
 return identity.authenticated&&!securityManaged?<PocketPaymentSecurityGate email={identity.email} getAccessToken={identity.getAccessToken}>{content}</PocketPaymentSecurityGate>:content
}
function Payment({checkout,returnUrl}:{checkout:BscCheckoutView;returnUrl?:string}){
 const identity=usePocketIdentity(),wallet=usePocketEmbeddedWallet(),{generateAuthorizationSignature}=useAuthorizationSignature()
 const [fundingBuffer,setFundingBuffer]=useState('0')
 const [quote,setQuote]=useState<BscPaymentQuote|null>(null),[quoteToken,setQuoteToken]=useState(''),[balance,setBalance]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[op,setOp]=useState<Operation|null>(null),[loaded,setLoaded]=useState(false)
 const alive=useRef(true),lock=useRef(false),current=useRef<Operation|null>(null)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const [verifiedReturn,setVerifiedReturn]=useState(returnUrl)
 useEffect(()=>{if(op?.state!=='completed')return;let active=true;void fetch(pocketApiUrl('/api/v2/checkouts?id='+encodeURIComponent(checkout.id)),{cache:'no-store'}).then(r=>r.json()).then(data=>{if(active&&data.ok&&data.checkout?.id===checkout.id&&data.checkout.status==='paid')setVerifiedReturn(data.returnUrl)}).catch(()=>{});return()=>{active=false}},[op?.state,checkout.id])
 const storage='pocket:bsc-checkout:'+identity.user?.id+':'+checkout.id
 const request=useCallback(async(body:Record<string,unknown>,approval?:string)=>{
  const token=await identity.getAccessToken();if(!token)throw Error('Sign in to continue.')
  const r=await fetch(pocketApiUrl('/api/pocket/bsc-payment'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(approval?{'x-pocket-payment-approval':approval}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)})
  const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'Payment could not be loaded.')
  if(!alive.current)throw Error('Account changed. Reopen checkout.')
  return data
 },[identity.getAccessToken])
 function adopt(next:Operation){
  if(next.checkoutId!==checkout.id||next.quote.ownerId!==identity.user?.id)throw Error('Payment does not match this checkout.')
  if(current.current?.state==='completed'&&next.state!=='completed')return
  current.current=next;setOp(next)
  if(['cancelled','not_submitted','failed','completed'].includes(next.state))localStorage.removeItem(storage)
  else localStorage.setItem(storage,next.operationId)
 }
 const refresh=useCallback(async()=>{
  if(!wallet.address)return
  const b=await request({action:'balance',checkoutId:checkout.id});setBalance(b.balanceUnits);setFundingBuffer(b.fundingBufferUnits)
  const r=await request({action:'quote',checkoutId:checkout.id});validateBscPayment(r.quote)
  if(r.quote.checkoutId!==checkout.id||r.quote.ownerId!==identity.user?.id||r.quote.walletAddress.toLowerCase()!==wallet.address.toLowerCase()||r.quote.asset!==checkout.asset)throw Error('Payment details changed.')
  setQuote(r.quote);setQuoteToken(r.quoteToken);setBalance(r.balanceUnits);setError('')
 },[wallet.address,checkout.id,checkout.asset,identity.user?.id,request])
 useEffect(()=>{
  if(!identity.authenticated||!wallet.address)return
  let active=true
  void (async()=>{
   const saved=localStorage.getItem(storage)
   if(saved){let next=await request({action:'status',operationId:saved});if(next.state==='prepared')next=await request({action:'cancel',operationId:saved});if(active)adopt(next);if(!['cancelled','failed','not_submitted'].includes(next.state))return}
   const pending=await request({action:'pending'}),match=pending.operations.find((p:Operation)=>p.checkoutId===checkout.id)
   if(match){if(active)adopt(match);return}
   await refresh()
  })().catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoaded(true)})
  return()=>{active=false}
 },[identity.authenticated,wallet.address,storage,request,refresh])
 useEffect(()=>{
  if(!op||!['cancelled','failed','not_submitted'].includes(op.state)||!wallet.address)return
  let active=true
  void refresh().then(()=>{if(active)setError(op.state==='cancelled'?'Payment cancelled.':'Payment was not sent. You can review it again.')}).catch(e=>{if(active)setError(e.message)})
  return()=>{active=false}
 },[op?.state,wallet.address,refresh])
 useEffect(()=>{
  if(!op||!['submitting','pending'].includes(op.state))return
  let active=true,timer:ReturnType<typeof setTimeout>
  const tick=async()=>{try{if(document.visibilityState!=='visible')return;let next=await request({action:'status',operationId:op.operationId});if(next.state==='prepared')next=await request({action:'cancel',operationId:op.operationId});if(active)adopt(next)}catch(e){if(active)setError((e as Error).message)}finally{if(active)timer=setTimeout(tick,4000)}}
  timer=setTimeout(tick,1000);return()=>{active=false;clearTimeout(timer)}
 },[op?.operationId,op?.state,request])
 async function pay(){
  if(lock.current||!quote)return
  lock.current=true;setBusy(true);setError('')
  let prepared:Operation|undefined,submitted=false
  try{
   if(quote.expiresAt<=Date.now()+5000){await refresh();return}
   await requestPocketPaymentApproval();const approval=takePocketPaymentApproval();if(!approval)throw Error('Payment cancelled.')
   const result=await request({action:'prepare',quoteToken},approval.token);prepared=result;adopt(result)
   const canonical=bscPaymentRequest(quote,PRIVY_APP_ID||'')
   if(JSON.stringify(result.request)!==JSON.stringify(canonical))throw Error('Payment approval changed.')
   const authorization=await generateAuthorizationSignature(canonical)
   if(!alive.current)throw Error('Payment cancelled.')
   submitted=true;adopt({...result,state:'pending'})
   adopt(await request({action:'submit',operationId:result.operationId,authorization:authorization.signature}))
  }catch(e){
   if(prepared&&!submitted){try{adopt(await request({action:'cancel',operationId:prepared.operationId}))}catch{setError('Payment approval could not be closed. Reopen checkout to check it.');return}}
   setError(submitted?'Your payment is still being confirmed.':/cancel|reject|denied|4001/i.test((e as Error).message)?'Payment cancelled.':(e as Error).message)
  }finally{lock.current=false;setBusy(false)}
 }
 if(!identity.ready)return <DeveloperLoadingSkeleton/>
 if(op&&['submitting','pending','completed'].includes(op.state))return <BrowserPaymentResult state={op.state==='completed'?'successful':'pending'} amount={formatPocketAssetAmount(checkout.amount,checkout.asset)+' '+checkout.asset} merchant={checkout.merchantName} returnUrl={verifiedReturn} detail={op.state==='completed'?'Payment received.':'Your payment is being confirmed.'}/>
 const total=quote?BigInt(quote.amountUnits)+BigInt(quote.reimbursementUnits):null
 const required=total??(parseUnits(checkout.amount,18)+BigInt(fundingBuffer))
 const shortfall=balance!==null&&BigInt(balance)<required?formatUnits(required-BigInt(balance),18):null
 return <BrowserCheckoutCard expiresAt={checkout.expiresAt} returnUrl={returnUrl} brandImageUrl={checkout.brandImageUrl} fundingHint={!quote&&shortfall?`Add ${shortfall} ${checkout.asset} to cover the payment and fee reserve. Review the exact total before paying.`:undefined} id={checkout.id} attempt="" merchant={checkout.merchantName} title={checkout.title||''} amount={formatPocketAssetAmount(checkout.amount,checkout.asset)+' '+checkout.asset} asset={checkout.asset} fiat={false} authenticated={identity.authenticated} email={identity.email} network="bsc" networks={[{value:'bsc',label:'BNB Chain'}]} onNetwork={()=>{}} walletReady={!!wallet.address} address={wallet.address||''} balance={balance===null?null:formatPocketAssetAmount(formatUnits(BigInt(balance),18),checkout.asset)} shortfall={shortfall} fee={quote?formatPocketAssetAmount(formatUnits(BigInt(quote.reimbursementUnits),18),checkout.asset):null} total={total===null?null:formatPocketAssetAmount(formatUnits(total,18),checkout.asset)} busy={busy||wallet.busy} blocked={identity.authenticated&&!loaded&&!wallet.error} error={error||wallet.error} prepare={async()=>{wallet.retry();await refresh()}} refresh={refresh} pay={pay} signOut={identity.logout}/>
}
