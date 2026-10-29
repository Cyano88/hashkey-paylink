import {formatPocketDisplayAmount,formatPocketPaymentAmount} from '../lib/pocketMoney'
import {PocketSendBalance,PocketSendAddress,PocketSendAmount} from '../components/PocketSendFormParts'
import usePocketSendKeypad from '../hooks/usePocketSendKeypad'
﻿import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {useAuthorizationSignature,useWallets} from '@privy-io/react-auth'
import {formatUnits,isAddress} from 'viem'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketBscBalances from '../hooks/usePocketBscBalances'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketSelect from '../components/PocketSelect'
import PocketAmountKeypad,{pocketAmountKeyDown} from '../components/PocketAmountKeypad'
import PocketAmountShimmer from '../components/PocketAmountShimmer'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketConfirmationDetails from '../components/PocketConfirmationDetails'
import PocketSlideAction from '../components/PocketSlideAction'
import PocketTransactionSheet from '../components/PocketTransactionSheet'
import {takePocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {pocketActivityReceipt} from '../lib/pocketReceipt'
import {createBscSendClient,type BscSendReview,type BscSendResult} from '../lib/pocketBscSendClient'
import {POCKET_BASE_PATH,POCKET_ROUTES,pocketApiUrl} from '../lib/pocketRoutes'
const networks=[['base','Base'],['arbitrum','Arbitrum'],['solana','Solana'],['ethereum','Ethereum'],['polygon','Polygon'],['xlayer','X Layer'],['bsc','BNB Chain']]
const field='min-h-14 w-full rounded-full border border-gray-200 bg-gray-50 px-4 text-sm outline-none dark:border-[#262626] dark:bg-[#181818]'
export default function PocketBscSendPage(){
 const identity=usePocketIdentity(),[params]=useSearchParams()
 return <BscSendForm key={(identity.user?.id||'')+':'+params.get('asset')} asset={params.get('asset')==='USDT'?'USDT':'USDC'}/>
}
function BscSendForm({asset}:{asset:'USDC'|'USDT'}){
 const identity=usePocketIdentity(),balances=usePocketBscBalances(),{wallets}=useWallets(),{generateAuthorizationSignature}=useAuthorizationSignature(),navigate=useNavigate()
 const sendKeypad=usePocketSendKeypad()
 const owner=identity.user?.id||'',storageKey='pocket:bsc-send:'+owner
 const latest=useRef({identity,wallets,generateAuthorizationSignature});latest.current={identity,wallets,generateAuthorizationSignature}
 const mounted=useRef(true),lock=useRef(false)
 const [recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[approvalBusy,setApprovalBusy]=useState(false),[checking,setChecking]=useState(true),[enabled,setEnabled]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reviewOpen,setReviewOpen]=useState(false),[review,setReview]=useState<BscSendReview|null>(null),[pending,setPending]=useState<BscSendResult|null>(null),[result,setResult]=useState<BscSendResult|null>(null)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const wallet=useCallback(async()=>{
  const current=latest.current,matching=current.wallets.filter(w=>w.walletClientType==='privy')
  if(!mounted.current||current.identity.user?.id!==owner||matching.length!==1)throw Error('Reconnect your Pocket wallet.')
  return matching[0].address
 },[owner])
 const request=useCallback(async(body:Record<string,unknown>,approval?:string)=>{
  await wallet();const token=await latest.current.identity.getAccessToken();if(!token)throw Error('Sign in to continue.')
  const response=await fetch(pocketApiUrl('/api/pocket/bsc-send'),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json',...(approval?{'x-pocket-payment-approval':approval}:{})},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(45000)})
  const data=await response.json();await wallet()
  if(!response.ok||!data.ok)throw Object.assign(Error(data.error||'Could not check this transfer.'),{status:response.status,code:data.code})
  return data
 },[wallet])
 const client=useMemo(()=>createBscSendClient({appId:String(import.meta.env.VITE_PRIVY_APP_ID||''),owner,identity:wallet,request,sign:async value=>(await latest.current.generateAuthorizationSignature(value)).signature}),[owner,wallet,request])
 const save=(value:BscSendResult)=>{localStorage.setItem(storageKey,JSON.stringify(value));if(mounted.current)setPending(value)}
 const clear=()=>{localStorage.removeItem(storageKey);setPending(null);setReview(null);setReviewOpen(false)}
 const apply=(value:BscSendResult)=>{
  if(!mounted.current)return
  if(['cancelled','not_submitted'].includes(value.state)){clear();setError('Transfer cancelled.');return}
  if(['completed','failed'].includes(value.state)){localStorage.removeItem(storageKey);setPending(null);setReviewOpen(false);setResult(value);void balances.refresh();return}
  save(value);setReviewOpen(false)
 }
 useEffect(()=>{
  let cancelled=false,retry:ReturnType<typeof setTimeout>|undefined
  try{const cached=JSON.parse(localStorage.getItem(storageKey)||'null');if(cached?.operationId&&cached?.quote?.ownerId===owner)setPending(cached)}catch{}
  const load=async()=>{
   try{
    const [cap,state]=await Promise.all([request({action:'capabilities'}),request({action:'pending'})]);if(cancelled)return
    setEnabled(cap.enabled===true)
    const active=state.operations?.find((v:BscSendResult)=>!['completed','failed','cancelled','not_submitted'].includes(v.state))
    if(active)save(active)
    else{const cached=JSON.parse(localStorage.getItem(storageKey)||'null');if(cached?.operationId&&cached?.quote?.ownerId===owner)setPending(cached)}
    setError('')
   }catch(e){if(!cancelled){setError((e as Error).message);retry=setTimeout(()=>void load(),5000)}}finally{if(!cancelled)setChecking(false)}
  }
  void load();return()=>{cancelled=true;if(retry)clearTimeout(retry)}
 },[request,storageKey,owner])
 const check=useCallback(async()=>{
  if(!pending||lock.current)return;lock.current=true
  try{apply(await client.recover(pending.operationId));setError('')}
  catch(e){if(mounted.current){if((e as {code?:string}).code==='send_not_prepared'&&pending.quote.expiresAt<=Date.now()){clear();setError('Transfer was not submitted. Review it again.')}else setError((e as Error).message)}}
  finally{lock.current=false}
 },[pending,client])
 useEffect(()=>{if(!pending||busy)return;void check();const timer=setInterval(()=>{if(document.visibilityState==='visible')void check()},5000);return()=>clearInterval(timer)},[pending,busy,check])
 const prepare=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setReviewOpen(true);setReview(null);setError('');setNotice('')
  try{const value=await client.quote(asset,recipient,amount);if(mounted.current)setReview(value)}catch(e){if(mounted.current)setError((e as Error).message)}finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 const refreshBeforeApproval=async()=>{
  if(!review)throw Error('Review this transfer first.')
  if(review.quote.expiresAt>Date.now()+20000)return
  await prepare();setNotice('Fee refreshed. Review the total and confirm.');throw Error('Review refreshed estimate')
 }
 const confirm=async()=>{
  if(!review||lock.current)return
  const approval=takePocketPaymentApproval();if(!approval)throw Error('Confirm with your PIN or fingerprint.')
  lock.current=true;setBusy(true);setError('')
  try{apply(await client.execute(review,approval.token,id=>save({operationId:id,state:'prepared',quote:review.quote})))}
  catch(e){if(mounted.current){setReviewOpen(false);setError((e as Error).message)}}finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 const blocked=busy||approvalBusy||!!pending
 const row=balances.holdings.find(r=>r.symbol===asset)
 const quote=(pending||result)?.quote||review?.quote
 const displayAsset=quote?.asset||asset,displayAmount=quote?formatUnits(BigInt(quote.amountUnits),18):amount
 const fee=quote?formatUnits(BigInt(quote.reimbursementUnits),18):null,total=quote?formatUnits(BigInt(quote.amountUnits)+BigInt(quote.reimbursementUnits),18):null
 const insufficient=!!review&&BigInt(review.balanceUnits)<BigInt(review.quote.amountUnits)+BigInt(review.quote.reimbursementUnits)
 const route=(network:string,nextAsset=asset)=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.send+'?'+new URLSearchParams({mode:'address',network,asset:nextAsset}))
 const details=<PocketConfirmationDetails amount={formatPocketPaymentAmount(displayAmount)+' '+displayAsset} rows={[["Wallet address",<span className="break-all">{quote?.recipient||recipient}</span>],["Network","BNB Chain"],["Fee",fee?formatPocketPaymentAmount(fee)+' '+displayAsset:busy?<PocketAmountShimmer label="Updating fee"/>:'Unavailable'],["Total",total?formatPocketPaymentAmount(total)+' '+displayAsset:busy?<PocketAmountShimmer label="Updating total"/>:'Unavailable']]}/>
 return <PocketRouteShell active="home" fixedPage refreshEnabled={false} navigationDisabled={blocked} onSelect={()=>{if(!blocked)navigate(POCKET_BASE_PATH+POCKET_ROUTES.home)}}>
 <PocketFlowHeader centered title="Send" onBack={()=>{if(!blocked)navigate(POCKET_BASE_PATH+POCKET_ROUTES.transfer)}}/>
 <section className="pocket-send-form flex min-h-0 flex-1 flex-col">
 <div className="pocket-form-fields min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
 <PocketSelect ariaLabel="Send asset" buttonClassName={field} value={asset} disabled={blocked} options={['USDC','USDT'].map(value=>({value,label:value}))} onChange={value=>route('bsc',value as 'USDC'|'USDT')}/>
 <div className="space-y-2.5"><p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Network</p><PocketSelect ariaLabel="Send network" buttonClassName={field} value="bsc" disabled={blocked} options={[...networks,...(asset==='USDC'?[['arc','Arc']]:[])].map(([value,label])=>({value,label}))} onChange={network=>route(network)}/></div>
 <PocketSendBalance>{row?.known&&!row.stale?formatPocketDisplayAmount(row.quantity)+' '+asset:balances.unavailable?'Unavailable':<PocketAmountShimmer label="Updating balance"/>}</PocketSendBalance>
 <PocketSendAddress value={recipient} onChange={setRecipient} disabled={blocked} network="bsc"/>
 <PocketSendAmount value={amount} onChange={setAmount} symbol={asset} decimals={18} disabled={blocked} onActivate={sendKeypad.show}/>
 {!checking&&!enabled&&<p className="text-xs text-gray-500">Transfers on this network are temporarily unavailable.</p>}
 {!reviewOpen&&error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
 </div><div className="pocket-keypad-dock" style={{visibility:reviewOpen||pending?'hidden':undefined}}><button className="pocket-cta-primary w-full" disabled={blocked||checking||!enabled||!isAddress(recipient)||! /^(0|[1-9]\d*)(\.\d{1,18})?$/.test(amount)||Number(amount)<=0} onClick={()=>void prepare()}>{busy||checking?<PocketAmountShimmer label="Preparing transfer"/>:'Continue'}</button>{sendKeypad.open&&<PocketAmountKeypad value={amount} onChange={setAmount} decimals={18} disabled={blocked||reviewOpen}/>}</div>
 </section>
 {reviewOpen&&<PocketBottomSheet title="Confirm send" showCloseButton dismissible={!blocked} dismissOnBackdrop={false} onClose={()=>{setReviewOpen(false);setReview(null);setError('')}}>{details}{notice&&<p role="status" className="mt-3 text-xs text-gray-500">{notice}</p>}{error&&<p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}<div className="mt-5">{review?<PocketSlideAction onPrepare={refreshBeforeApproval} onApprovalBusyChange={setApprovalBusy} onConfirm={confirm} status={busy?'pending':'idle'} disabled={busy||insufficient} labels={{idle:'Confirm send',disabled:insufficient?'Insufficient balance':'Confirm send',pending:'Processing transfer'}}/>:<button className="pocket-cta-primary w-full" disabled={busy} onClick={()=>void prepare()}>{busy?<PocketAmountShimmer label="Preparing transfer"/>:'Retry fee quote'}</button>}</div></PocketBottomSheet>}
 {pending&&!reviewOpen&&<PocketBottomSheet title="Sending" dismissible={false} showCloseButton={false} onClose={()=>{}}>{details}<p role="status" className="mt-4 text-sm text-gray-500">Checking your transfer.</p>{error&&<p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}<button className="pocket-cta-primary mt-5 w-full" disabled={busy} onClick={()=>void check()}>Check status</button></PocketBottomSheet>}
 {result&&<PocketTransactionSheet title="Outgoing" state={result.state==='completed'?'successful':'failed'} amount={displayAmount+' '+displayAsset} receipt={result.hash?pocketActivityReceipt({eventId:'pocket-bsc-send:'+result.operationId,txHash:result.hash,chain:'bsc',payer:result.quote.walletAddress,recipient:result.quote.recipient,amount:displayAmount,feeAmount:result.state==='completed'?formatUnits(BigInt(result.quote.reimbursementUnits),18):'0',assetSymbol:displayAsset,memo:'Sent',ts:result.quote.issuedAt,source:'wallet-withdrawal',settlementType:'wallet_transfer',direction:'out',paycrestStatus:result.state==='completed'?'confirmed':'failed'}):null} onDone={()=>{setResult(null);clear();setAmount('');setRecipient('')}}/>}
 </PocketRouteShell>
}
