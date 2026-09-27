import {useEffect,useRef,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import {formatUnits} from 'viem'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketStockWallet from '../hooks/usePocketStockWallet'
import PocketArcTokenPicker from './PocketArcTokenPicker'
import PocketBottomSheet from './PocketBottomSheet'
import PocketXPayProgress from './PocketXPayProgress'
import PocketPaymentSuccess from './PocketPaymentSuccess'
import {stockPickerTokens} from '../lib/pocketStockPickerTokens'
import {formatStockQuantity} from '../lib/pocketStockDisplay'
import {xpayBankRequest,type XPayBankPayment} from '../lib/pocketXPayBankClient'
import {requestPocketPaymentApproval,takePocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {unlockPocketBaseWallet} from '../controllers/usePocketWalletController'
import {executeCircleEvmEmailChallenge,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import type {PaylinkReceipt} from '../../lib/paymentReceiptPdf'
const cta='pocket-cta-primary w-full'
export function xpayBankReceipt(p:XPayBankPayment):PaylinkReceipt{
 return {type:'money_out',eventId:p.id,receiptId:p.id,receiptHash:p.payoutHash||p.swapHash||'',title:'XPay payment',bankSettlementStatus:p.bankDelivery,fiatCurrency:p.currency as 'NGN'|'UGX',status:p.bankDelivery==='refunding'?'refunding':p.state==='successful'?'successful':p.state==='refunded'?'refunded':p.state==='failed'?'failed':'pending',txHash:p.payoutHash||'',chain:'base',payer:p.source,recipient:p.merchantName,memo:'XPay payment',amount:p.amount,asset:p.symbol,amountNgn:p.fiatAmount,createdAt:p.createdAt,source:'xpay',referenceId:p.id,brandName:'Pocket',brandKind:'pocket'}
}
export default function PocketXPayBankCheckout({checkoutId,merchantId,merchantName,assets,currency,onClose,resumeId}:{checkoutId:string;merchantId:string;merchantName:string;assets:string[];currency:string;onClose:()=>void;resumeId?:string}){
 const identity=usePocketIdentity(),{login}=usePrivy(),wallet=usePocketStockWallet()
 const tokens=stockPickerTokens(wallet.displaySnapshot||wallet.snapshot).filter(t=>assets.includes(t.symbol)&&t.symbol!=='OKB')
 const [token,setToken]=useState(''),[amount,setAmount]=useState(''),[payment,setPayment]=useState<XPayBankPayment|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[sheet,setSheet]=useState(false)
 const key=identity.user?.id+':'+checkoutId+':'+merchantId,scope=useRef(key);scope.current=key
 const current=useRef(payment);current.current=payment
 const mounted=useRef(true),locked=useRef(false),session=useRef<CircleEvmEmailSession|null>(null),requestKey=useRef(crypto.randomUUID())
 const storage='pocket.xpay.bank:'+key
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{if(!token&&tokens[0])setToken(tokens[0].address)},[token,tokens[0]?.address])
 const active=(expected:string)=>{if(!mounted.current||scope.current!==expected)throw Error('Your Pocket account changed.')}
 const adopt=(p:XPayBankPayment)=>{
  const old=current.current
  if(old?.id===p.id&&(old.updatedAt>p.updatedAt||old.state==='successful'&&!['successful','refunded'].includes(p.state)))return old
  current.current=p;setPayment(p);wallet.reconcileXPay(p)
  if(['successful','refunded'].includes(p.state)){localStorage.removeItem(storage);setAmount('');void wallet.refresh().catch(()=>undefined)}
  else if(p.state!=='quoted'){let saved:{id?:string}={};try{saved=JSON.parse(localStorage.getItem(storage)||'{}')}catch{};localStorage.setItem(storage,JSON.stringify(saved.id===p.id?saved:{id:p.id}))}
  return p
 }
 const request=async(body:Record<string,unknown>,approval?:{token:string;authorization:string})=>{const expected=scope.current;const r=await xpayBankRequest(identity.getAccessToken,body,approval);active(expected);return r}
 const reconcile=async(id:string)=>{
  let saved:{id?:string;hash?:string;stage?:string}={};try{saved=JSON.parse(localStorage.getItem(storage)||'{}')}catch{}
  if(saved.id===id&&saved.hash&&['swap','bridge'].includes(saved.stage||''))await request({action:saved.stage==='swap'?'swapSubmitted':'bridgeSubmitted',id,hash:saved.hash})
  const result=await request({action:'status',id,...(session.current?{circleUserToken:session.current.userToken}:{})});return adopt(result.payment)
 }
 useEffect(()=>{
  session.current=null;current.current=null;setPayment(null);setError('');setSheet(false);setLoading(true)
  let live=true
  if(!identity.authenticated){setLoading(false);return}
  void (resumeId?xpayBankRequest(identity.getAccessToken,{action:'status',id:resumeId}).then(r=>({payments:[r.payment]})):xpayBankRequest(identity.getAccessToken,{action:'list'})).then(result=>{
   if(!live)return
   const existing=result.payments?.find(p=>resumeId?p.id===resumeId:p.checkoutId===checkoutId&&p.merchantId===merchantId&&!['quoted','successful','refunded'].includes(p.state))
   if(resumeId&&!existing)setError('This payment is not available in your account.')
   if(existing){adopt(existing);setSheet(true);void reconcile(existing.id).catch(()=>undefined)}
  }).catch(()=>{if(live)setError('Could not check your existing payments. Try again before starting another.')}).finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[key,identity.authenticated])
 useEffect(()=>{
  if(!payment||['quoted','successful','refunded','failed'].includes(payment.state))return
  let stopped=false,reading=false
  const poll=async()=>{if(stopped||reading||locked.current||document.visibilityState==='hidden')return;reading=true;try{await reconcile(payment.id)}catch{/* Retain the authoritative last state. */}finally{reading=false}}
  const timer=window.setInterval(poll,5000);return()=>{stopped=true;clearInterval(timer)}
 },[payment?.id,payment?.state,key])
 async function run(work:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await work()}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'This payment could not continue. Check its status.')}finally{locked.current=false;if(mounted.current)setBusy(false)}}
 async function unlock(){const expected=scope.current;const unlocked=await unlockPocketBaseWallet(identity);active(expected);session.current=unlocked.session;return unlocked.session}
 const prepare=()=>run(async()=>{
  if(!wallet.address)throw Error('Open your XStocks wallet before paying.')
  await unlock()
  const result=await request({action:'prepare',key:requestKey.current,checkoutId,merchantId,source:wallet.address,token,fiatAmount:amount})
  if(result.payment.baseWallet.toLowerCase()!==session.current!.wallet.address.toLowerCase())throw Error('Your Base wallet changed. Review this payment again.')
  adopt(result.payment);setSheet(true)
 })
 const drive=()=>run(async()=>{
  let p=current.current;if(!p)return
  const expected=scope.current,s=await unlock(),executed=new Set<string>(),deadline=Date.now()+90000
  if(s.wallet.address.toLowerCase()!==p.baseWallet.toLowerCase())throw Error('Reconnect the Base wallet used for this payment.')
  if(p.state==='quoted'){
   await requestPocketPaymentApproval();active(expected)
   const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm your payment again.')
   p=adopt((await request({action:'approve',id:p.id},approval)).payment)
  }
  if(p.state==='failed')p=adopt((await request({action:'retry',id:p.id})).payment)
  while(Date.now()<deadline){
   active(expected)
   if(['successful','refunded'].includes(p.state))return
   if(p.state==='failed')throw Error(p.error||'This step did not complete. Retry to continue.')
   if(p.replacement)throw Error('Confirm the updated bank quote before continuing.')
   const step=p.state==='approved'?(p.progress.swap?'swap':'bridge'):p.state==='swap_confirmed'?'bridge':p.state==='bridging'&&p.bridge?.state==='quoted'?'bridge':null
   if(step){
    const result=await request({action:step,id:p.id});p=adopt(result.payment)
    if(!result.transaction)throw Error('The signing request is unavailable. Check payment status.')
    const signing=p
    const hash=await wallet.signXPay(signing,result,h=>{if(result.transaction?.kind!=='approval')localStorage.setItem(storage,JSON.stringify({id:signing.id,stage:step,hash:h}))})
    active(expected)
    if(result.transaction.kind!=='approval')await request({action:step==='swap'?'swapSubmitted':'bridgeSubmitted',id:p.id,hash})
   }else{
    const mint=p.state==='bridging'&&['attested','mint_requested','mint_failed','mint_submitted'].includes(p.bridge?.state||'')
    const payout=['payout_ready','payout_requested','payout_submitted'].includes(p.state)
    if(mint||payout){
     let result
     try{result=await request({action:mint?'mint':'payout',id:p.id,circleUserToken:s.userToken})}
     catch(e){if((e as {code?:string}).code==='ATTESTATION_EXPIRED'){await request({action:'refreshAttestation',id:p.id});throw Error('The bridge confirmation is refreshing. Retry to continue.')}throw e}
     p=adopt(result.payment)
     if(result.challengeId&&!executed.has(result.challengeId)){
      executed.add(result.challengeId)
      await executeCircleEvmEmailChallenge({session:s,challengeId:result.challengeId,pendingMessage:'Your wallet approval is still being checked. Reopen this XPay payment to continue.'})
      active(expected)
     }
    }
   }
   await new Promise(resolve=>window.setTimeout(resolve,2500));active(expected);p=await reconcile(p.id)
  }
 })
 const reviewPayout=()=>run(async()=>{if(!payment)return;adopt((await request({action:'reviewPayout',id:payment.id})).payment)})
 const acceptPayout=()=>run(async()=>{if(!payment?.replacement)return;await requestPocketPaymentApproval();const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm the updated quote again.');adopt((await request({action:'acceptPayout',id:payment.id,intentId:payment.replacement.intentId},approval)).payment)})
 const quoteExpired=payment?.state==='quoted'&&(payment.expiresAt<=Date.now()+90000||Boolean(payment.quoteExpiresAt&&payment.quoteExpiresAt<=Date.now()))
 const expired=payment&&payment.expiresAt<=Date.now()+90000&&!['payout_requested','payout_submitted','successful','refunded'].includes(payment.state)
 const terminal=payment&&['successful','refunded'].includes(payment.state)
 if(!identity.authenticated)return <button className={cta} onClick={login}>Sign in to Pocket</button>
 return <>
  <p className="text-sm font-semibold">{merchantName}</p>
  <PocketArcTokenPicker label="Pay with" value={token} excluded="" tokens={tokens} networkLabel="X Layer" clean disabled={busy||Boolean(payment&&payment.state!=='quoted')} onChange={t=>{setToken(t.address);requestKey.current=crypto.randomUUID();setPayment(null)}} discover={async()=>{throw Error('Choose an asset accepted by this merchant.')}}/>
  <label className="block text-xs text-gray-500">Amount in {currency}<input aria-label={'Amount in '+currency} className="mt-2 min-h-12 w-full rounded-xl bg-gray-100 px-3 text-base outline-none dark:bg-[#171717]" inputMode="decimal" value={amount} disabled={busy||Boolean(payment&&payment.state!=='quoted')} onChange={e=>{if(/^\d*(?:\.\d{0,2})?$/.test(e.target.value)){setAmount(e.target.value);requestKey.current=crypto.randomUUID();setPayment(null)}}}/></label>
  <p className="text-xs leading-5 text-gray-500">Your selected asset is converted to USDC and bridged to Base for the merchant's bank payment. Any unused USDC stays in your wallet.</p>
  <button className={cta} disabled={busy||loading||!wallet.address||(!payment&&(!amount||Boolean(resumeId)))} onClick={()=>payment?setSheet(true):void prepare()}>{payment?'Continue payment':'Continue'}</button>
  {error&&!sheet&&<p role="alert" className="text-xs text-red-500">{error}</p>}
  {sheet&&(terminal?<PocketPaymentSuccess receipt={xpayBankReceipt(payment)} onDone={onClose}/>:<PocketBottomSheet title="XPay" showCloseButton dismissOnBackdrop={false} dismissible={!busy} onClose={()=>setSheet(false)}>
   <h2 className="text-lg font-semibold">{payment?.merchantName}</h2>
   <p className="mt-4 text-2xl font-semibold">{formatStockQuantity(payment?.amount||'0')} {payment?.symbol}</p>
   <p className="mt-2 text-sm text-gray-500">{payment?.currency} {payment?.fiatAmount} to receive</p>
   {payment&&<><p className="mt-2 text-xs text-gray-500">Payment and payout fees included · {formatUnits(BigInt(payment.fundingUnits),6)} USDC</p><p className="mt-1 text-xs text-gray-500">X Layer network fees are paid in OKB.</p><PocketXPayProgress progress={payment.progress}/></>}
   {error&&<p role="alert" className="my-3 text-xs leading-5 text-gray-500">{error}</p>}
   {payment?.replacement?<><p className="my-3 text-xs text-gray-500">Updated total: {formatUnits(BigInt(payment.replacement.fundingUnits),6)} USDC. Your completed steps remain saved.</p><button className={cta} disabled={busy} onClick={()=>void acceptPayout()}>Confirm updated quote</button></>:quoteExpired?<button className={cta+' mt-5'} disabled={busy} onClick={()=>{requestKey.current=crypto.randomUUID();void prepare()}}>Update quote</button>:expired&&payment?.state!=='quoted'?<button className={cta+' mt-5'} disabled={busy} onClick={()=>void reviewPayout()}>Update quote</button>:<button className={cta+' mt-5'} disabled={busy} aria-busy={busy} onClick={()=>void drive()}>{busy&&<span aria-hidden="true" className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"/>}{busy||payment?.state==='quoted'?'Pay '+merchantName:error||payment?.state==='failed'?'Retry':'Continue payment'}</button>}
   {payment?.state==='quoted'&&!busy&&<button className="min-h-11 w-full text-xs text-gray-500" onClick={()=>{setSheet(false);setPayment(null);requestKey.current=crypto.randomUUID()}}>Edit amount</button>}
  </PocketBottomSheet>)}
 </>
}
