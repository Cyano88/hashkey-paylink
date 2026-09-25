import StockPaymentReceipt from './StockPaymentReceipt';
import { selectHostedWallet } from '../../lib/xstocksAgreement/hostedWallet';
// Signing/reconciliation adapted from PrivyTradeCheckout; work terms remain independent.
import { useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { createPublicClient, getAddress, http, type Hex } from 'viem';
import { useStreamConfirm } from './ConfirmSheet';
import type { HostedWorkItem as ServiceRequest } from '../../lib/xstocksAgreement/hostedClient';
import { WORK_ACTION_LABELS, WORK_STATES, workPaymentLabel, workTermsNotice } from '../../lib/xstocksAgreement/workXLayer';
import { SHARE_CUSTODY_NOTICE, TRADE_XLAYER_ARBITER, TRADE_ACTION_LABELS, type TradeXLayerAction, type TradeXLayerStatus, type TradeXLayerTransaction } from '../../lib/xstocksAgreement/protocol';
const rpc=createPublicClient({transport:http('https://rpc.xlayer.tech',{timeout:15000,retryCount:1})});
const button='block min-h-11 w-full rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950';
type WorkStatus=TradeXLayerStatus&{wallet:{address:string}|null;clientAddress?:string;workerAddress?:string;customerReady:boolean;providerReady:boolean;fundBy?:number;workEvidence?:Array<{hash:string;body:string;actor:string;createdAt:string}>};
type Pending={transaction:TradeXLayerTransaction;hash?:Hex};
export default function HostedWorkCheckout({item,request,onUpdated}:{item:ServiceRequest;request(payload:Record<string,unknown>):Promise<unknown>;onUpdated():void}){
  const {user,authenticated}=usePrivy(),{wallets}=useWallets(),{sendTransaction}=useSendTransaction();
  const wallet=selectHostedWallet(authenticated,user,wallets);
  const terms=item.terms.find(term=>term.version===item.activeVersion)!,payment=terms.xlayerPayment!;
  const isTrade=terms.kind==='trade',labels=isTrade?{...TRADE_ACTION_LABELS,create:'Set up payment',accept:'Confirm payment terms',dispatch:terms.trade?.handover==='Pickup'?'Mark ready for pickup':'Mark as sent',receipt:'Confirm received',cancel:'Cancel payment'}:WORK_ACTION_LABELS;
  const sellerLabel=isTrade?'Seller':'Worker',buyerLabel=isTrade?'Buyer':'Client';
  const notice=isTrade&&terms.trade?'Dispatch within '+terms.trade.dispatchDays+' days after funding. Delivery window: '+terms.trade.deliveryDays+' days after dispatch. Confirming receipt starts a '+terms.trade.inspectionHours+'-hour inspection period. The seller can claim payment after inspection unless a dispute is confirmed on-chain before the deadline. Missed dispatch permits a buyer refund. After dispatch, the seller can open a dispute once the delivery window ends. The seller may voluntarily refund. '+(terms.stockCustody?SHARE_CUSTODY_NOTICE:'The stock quantity stays fixed even if its dollar value changes.')+'':workTermsNotice(terms.durationSeconds,payment);
  const states=isTrade?['Waiting for seller','Ready to pay','Payment held securely',terms.trade?.handover==='Pickup'?'Ready for pickup':'Sent by seller',item.role==='customer'?'Your review period':'Buyer review period','Disputed','Payment released','Refunded','Dispute resolved','Cancelled']:WORK_STATES;
  const identity=[user?.id,item.id,item.activeVersion,wallet?.address.toLowerCase()].join(':');
  const current=useRef({identity,epoch:0});if(current.current.identity!==identity)current.current={identity,epoch:current.current.epoch+1};const epoch=current.current.epoch;
  const mounted=useRef(true),lock=useRef(false),requestRef=useRef(request),updatedRef=useRef(onUpdated);requestRef.current=request;updatedRef.current=onUpdated;
  const refreshVersion=useRef(0);
  const [loadError,setLoadError]=useState('');
  const [status,setStatus]=useState<WorkStatus>(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[evidence,setEvidence]=useState(''),[pending,setPending]=useState(false);
  const {confirm,confirmation}=useStreamConfirm();
  const storageKey='hashpaylink:xstocks-agreement-pending:v1:'+identity;
  function assertCurrent(){if(!mounted.current||(current.current.identity!==identity||current.current.epoch!==epoch))throw Error('Your account or agreement changed. Please reopen it.');}
  async function api(extra:Record<string,unknown>={}){assertCurrent();const result=await requestRef.current({action:'work_xlayer_status',requestId:item.id,version:item.activeVersion,...extra}) as WorkStatus;assertCurrent();return result;}
  async function refresh(clearActionError=false){const version=++refreshVersion.current;try{const next=await api();if(version===refreshVersion.current){setStatus(next);setLoadError('');if(clearActionError)setError('');setPending(Boolean(localStorage.getItem(storageKey)));}return next;}catch(e){if(version===refreshVersion.current&&mounted.current&&current.current.identity===identity&&current.current.epoch===epoch)setLoadError('Payment status could not be verified. Refresh before continuing.');throw e;}}
  useEffect(()=>{mounted.current=true;lock.current=false;++refreshVersion.current;setStatus(undefined);setBusy('');setError('');setLoadError('');setEvidence('');try{setPending(Boolean(localStorage.getItem(storageKey)))}catch{setPending(true);setError('Allow browser storage to keep payment recovery available.')}const update=()=>{if(!lock.current)void refresh().catch(()=>{});};update();const timer=setInterval(update,15000);return()=>{mounted.current=false;clearInterval(timer);};},[identity]);
  async function reconcile(record:Pending){
    if(!record.hash)throw Error('Submission is uncertain. Check wallet activity before retrying; another payment will not be sent.');
    setBusy('Confirming transaction');
    const receipt=await rpc.waitForTransactionReceipt({hash:record.hash,confirmations:3,timeout:90000});assertCurrent();
    if(receipt.transactionHash.toLowerCase()!==record.hash.toLowerCase())throw Error('Transaction was replaced. Review wallet activity.');
    const tx=await rpc.getTransaction({hash:record.hash});assertCurrent();
    if(await rpc.getChainId()!==196)throw Error('Payment network mismatch.');assertCurrent();
    if(getAddress(tx.from)!==getAddress(record.transaction.account)||tx.to?.toLowerCase()!==record.transaction.to.toLowerCase()||tx.input!==record.transaction.data||tx.value!==0n)throw Error('Transaction verification failed.');
    localStorage.removeItem(storageKey);setPending(false);
    if(receipt.status!=='success')throw Error('The transaction reverted. No payment was completed.');
  }
  async function submit(operation:TradeXLayerAction){
    if(!wallet||!user?.id)throw Error('Your payment wallet is still loading. Please try again.');
    if(localStorage.getItem(storageKey))throw Error('Check your pending transaction first.');
    const plan=await api({operation,evidence}),tx=plan.transaction;
    if(!tx||tx.chainId!==196||tx.value!=='0'||getAddress(tx.account)!==getAddress(wallet.address)||plan.token?.toLowerCase()!==payment.token.toLowerCase()||plan.amount!==payment.amountUnits||plan.decimals!==payment.decimals)throw Error('The payment details do not match this agreement. Reopen checkout.');
    await wallet.switchChain(196);assertCurrent();
    const record:Pending={transaction:tx};localStorage.setItem(storageKey,JSON.stringify(record));setPending(true);setBusy(operation==='approve'?'Approving payment':operation==='fund'?'Sending payment':labels[operation]);
    try{const result=await sendTransaction({to:tx.to,data:tx.data,value:0n,chainId:196},{address:wallet.address,uiOptions:{showWalletUIs:false}});record.hash=result.hash;localStorage.setItem(storageKey,JSON.stringify(record));assertCurrent();await reconcile(record);}
    catch(e){const code=(e as {code?:number;cause?:{code?:number}}).code??(e as {cause?:{code?:number}}).cause?.code;if(code===4001&&!record.hash){localStorage.removeItem(storageKey);if((current.current.identity===identity&&current.current.epoch===epoch))setPending(false);}throw e;}
  }
  async function run(action:TradeXLayerAction|'wallet'|'recover'){
    if(lock.current)return;++refreshVersion.current;lock.current=true;setBusy('Checking agreement');setError('');
    try{
      if(action==='wallet'){if(!wallet)throw Error('Your payment wallet is still loading. Please try again.');if(!await confirm({title:'Accept payment terms?',description:terms.amount+' '+workPaymentLabel(payment)+'. '+notice,action:'Accept terms'}))return;assertCurrent();await api({action:'work_xlayer_wallet',address:wallet.address});}
      else if(action==='recover'){const raw=localStorage.getItem(storageKey);if(raw)await reconcile(JSON.parse(raw));}
      else{
        const paying=action==='approve'||action==='fund';
        const description=isTrade?(paying?terms.amount+' '+workPaymentLabel(payment)+' will be held securely until it can be released under the agreed terms. Your wallet may ask for permission first, then payment. Network fees are paid in OKB.':action==='receipt'?'Confirm receipt and start the '+payment.reviewHours+'-hour inspection period. The seller can claim payment after it ends unless a dispute is confirmed on-chain before the deadline.':action==='release'?'Release the full stock payment to the seller. This cannot be undone.':action==='dispatch'?(terms.trade?.handover==='Pickup'?'Let the buyer know the item is ready for pickup.':'Let the buyer know the item has been sent.')+' Your note will be saved. Payment stays held until release.':(action==='create'?'Set up a secure payment for this agreement. This does not take payment yet.':action==='accept'?'Confirm the agreed amount and terms so the buyer can pay.':action==='cancel'?'Cancel this unpaid agreement. No stock payment will be taken.':action==='refund'?'Return the held payment to the buyer. This cannot be undone.':action==='dispute'?'Ask for help resolving this agreement. Payment stays held until the dispute is resolved.': 'Continue with '+labels[action].toLowerCase()+'.')+' A network fee may apply.'):paying?terms.amount+' '+workPaymentLabel(payment)+' will be held for this work agreement and paid to '+(status?.workerAddress||'the worker')+'. Network fees are paid in OKB.':action==='receipt'?'Start the '+payment.reviewHours+'-hour review period. After it ends, the worker can claim payment unless you confirm a dispute on-chain before the deadline.':action==='release'?'Approve this work and release the full token payment to the worker. This cannot be undone.':action==='dispatch'?'Record your work submission and its evidence. This does not prove client approval or release payment.':'Confirm '+labels[action].toLowerCase()+'. A network fee may apply.';
        if(!await confirm({title:(paying?'Pay securely':labels[action])+'?',description:description+(paying&&terms.stockCustody?' The stock quantity can change if its issuer adjusts the shares. In a split payment, any fractional share remainder goes to the seller.':''),action:paying?'Confirm payment':labels[action]}))return;assertCurrent();
        if(paying){let funded=false;for(let step=0;step<3;step++){const next=await api(),operation=next.actions.includes('fund')?'fund':next.actions.includes('approve')?'approve':undefined;if(!operation)throw Error('Payment state changed. Refresh.');await submit(operation);if(operation==='fund'){funded=true;break;}}if(!funded)throw Error('Approval completed. Refresh to continue.');}
        else await submit(action);
      }
    }catch(e){if((current.current.identity===identity&&current.current.epoch===epoch)&&mounted.current)setError('Action did not complete: '+(e as Error).message);}
    finally{if((current.current.identity===identity&&current.current.epoch===epoch)&&mounted.current){await refresh().catch(()=>{});if(current.current.identity===identity&&current.current.epoch===epoch&&mounted.current){lock.current=false;setBusy('');updatedRef.current();}}}
  }
  return <section className='mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-white/10' aria-label={isTrade?'Trade escrow':'Work escrow'}>
    {confirmation}<h3 className='text-sm font-bold'>{isTrade?'Trade payment':'Work payment'}</h3>
    <p className='text-sm font-bold'>{terms.amount} {workPaymentLabel(payment)}</p>
    <p role='status' aria-live='polite' className='text-xs text-gray-500'>{busy?busy:pending?'Checking your pending transaction':loadError?'Payment status unavailable':status?.fundingIssue?'Stock payment unavailable':status?.pending?'Waiting for network confirmation':status?.state!==undefined?states[status.state]:status?(!status.wallet?'Review and accept the payment terms.':!status.customerReady||!status.providerReady?'Waiting for both accounts.':item.role==='customer'?'Waiting for the seller to set up payment.':'Ready to set up payment.'):'Checking payment...'}</p>
    <details className='text-xs text-gray-500'><summary className='min-h-8 cursor-pointer'>Payment terms</summary><p>{notice}</p><p className='break-all'>Asset: {payment.token} · X Layer</p><p className='break-all'>{sellerLabel}: {status?.workerAddress||'Not confirmed'}</p><p className='break-all'>{buyerLabel}: {status?.clientAddress||'Not confirmed'}</p><p className='break-all'>Dispute reviewer: {TRADE_XLAYER_ARBITER}</p>{status?.fundBy&&<p>Fund by {new Date(status.fundBy*1000).toLocaleString()}.</p>}</details>
    {(!status?.stockReceipt||status.stockReceipt.fundedShares==='0')&&status?.escrow&& !/^0x0{40}$/i.test(status.escrow)&&<a className='block text-xs underline' href={'https://www.oklink.com/xlayer/address/'+status.escrow} target='_blank' rel='noreferrer'>View transaction details</a>}
    {status?.fundingIssue&&<p role='alert' className='text-xs text-red-600'>{status.fundingIssue}</p>}
    {status&&<StockPaymentReceipt status={status} decimals={payment.decimals} label={workPaymentLabel(payment)} role={item.role}/>}
    {!wallet&&<p className='text-xs'>Your payment wallet is loading. Sign in again if it does not load.</p>}
    {!busy&&!pending&&!loadError&&status&&!status.wallet&&<button className={button} disabled={!!busy||!wallet||!status.enabled} onClick={()=>void run('wallet')}>Accept payment terms</button>}
    {item.role==='provider'&&!status?.fundingIssue&&status?.customerReady&&status.providerReady&&!status.pending&&status.state===undefined&&!status.actions.length&&<p className='text-xs text-gray-500'>Payment setup is temporarily unavailable. Please try again.</p>}
    {status?.wallet&&!(status.customerReady&&status.providerReady)&&<p className='text-xs'>Waiting for the other person to accept the payment terms.</p>}
    {status?.actions.some(action=>['dispatch','refund','dispute'].includes(action))&&<label className='block text-xs'>{isTrade?'Delivery or pickup note':'Work link or explanation'}<textarea className='mt-1 w-full rounded-xl border bg-transparent p-3' minLength={10} maxLength={2000} value={evidence} disabled={!!busy} onChange={event=>setEvidence(event.target.value)}/></label>}
    {!!status?.workEvidence?.length&&<details className='text-xs'><summary>Shared notes</summary><p className='text-gray-500'>Notes are saved before confirmation. Check the payment status to see whether an action completed.</p>{status.workEvidence.map(note=><p className='mt-2 whitespace-pre-wrap break-words' key={note.actor+note.hash}>{note.actor==='provider'?sellerLabel:buyerLabel}: {note.body}</p>)}</details>}
    {!busy&&!pending&&!loadError&&!status?.pending&&status?.actions.map(action=><button key={action} className={action==='cancel'?'block min-h-11 w-full text-xs text-gray-500 underline disabled:opacity-40':button} disabled={!!busy||!wallet||status.wallet?.address.toLowerCase()!==wallet.address.toLowerCase()} onClick={()=>void run(action)}>{action==='approve'||action==='fund'?'Pay securely':labels[action]}</button>)}
    {pending&&!busy&&<button className={button} disabled={!!busy} onClick={()=>void run('recover')}>Check pending transaction</button>}
    {loadError&&<p role='alert' className='text-xs text-red-600'>{loadError}</p>}{error&&<p role='alert' className='text-xs text-red-600'>{error}</p>}
    <button className='block min-h-11 w-full text-center text-xs font-bold underline' disabled={!!busy} onClick={()=>void refresh(true).then(()=>updatedRef.current()).catch(()=>{})}>Refresh agreement</button>
  </section>;
}
