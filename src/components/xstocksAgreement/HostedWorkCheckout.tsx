import { selectHostedWallet } from '../../lib/xstocksAgreement/hostedWallet';
// Signing/reconciliation adapted from PrivyTradeCheckout; work terms remain independent.
import { useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { createPublicClient, getAddress, http, type Hex } from 'viem';
import { useStreamConfirm } from './ConfirmSheet';
import type { HostedWorkItem as ServiceRequest } from '../../lib/xstocksAgreement/hostedClient';
import { WORK_ACTION_LABELS, WORK_STATES, workPaymentLabel, workTermsNotice } from '../../lib/xstocksAgreement/workXLayer';
import { TRADE_XLAYER_ARBITER, TRADE_ACTION_LABELS, type TradeXLayerAction, type TradeXLayerStatus, type TradeXLayerTransaction } from '../../lib/xstocksAgreement/protocol';
const rpc=createPublicClient({transport:http('https://rpc.xlayer.tech',{timeout:15000,retryCount:1})});
const button='block min-h-11 w-full rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950';
type WorkStatus=TradeXLayerStatus&{wallet:{address:string}|null;clientAddress?:string;workerAddress?:string;customerReady:boolean;providerReady:boolean;fundBy?:number;workEvidence?:Array<{hash:string;body:string;actor:string;createdAt:string}>};
type Pending={transaction:TradeXLayerTransaction;hash?:Hex};
export default function HostedWorkCheckout({item,request,onUpdated}:{item:ServiceRequest;request(payload:Record<string,unknown>):Promise<unknown>;onUpdated():void}){
  const {user,authenticated}=usePrivy(),{wallets}=useWallets(),{sendTransaction}=useSendTransaction();
  const wallet=selectHostedWallet(authenticated,user,wallets);
  const terms=item.terms.find(term=>term.version===item.activeVersion)!,payment=terms.xlayerPayment!;
  const isTrade=terms.kind==='trade',labels=isTrade?TRADE_ACTION_LABELS:WORK_ACTION_LABELS;
  const sellerLabel=isTrade?'Seller':'Worker',buyerLabel=isTrade?'Buyer':'Client';
  const notice=isTrade&&terms.trade?'Dispatch within '+terms.trade.dispatchDays+' days after funding. Delivery window: '+terms.trade.deliveryDays+' days after dispatch. Confirming receipt starts a '+terms.trade.inspectionHours+'-hour inspection period. The seller can claim payment after inspection unless a dispute is confirmed on-chain before the deadline. Missed dispatch permits a buyer refund. After dispatch, the seller can open a dispute once the delivery window ends. The seller may voluntarily refund. The stock quantity stays fixed even if its dollar value changes.':workTermsNotice(terms.durationSeconds,payment);
  const states=isTrade?['Awaiting seller confirmation','Ready for payment','Payment held in escrow','Dispatched','Buyer inspection period','Disputed','Payment released','Refunded','Dispute resolved','Cancelled']:WORK_STATES;
  const identity=[user?.id,item.id,item.activeVersion,wallet?.address.toLowerCase()].join(':');
  const current=useRef({identity,epoch:0});if(current.current.identity!==identity)current.current={identity,epoch:current.current.epoch+1};const epoch=current.current.epoch;
  const mounted=useRef(true),lock=useRef(false),requestRef=useRef(request),updatedRef=useRef(onUpdated);requestRef.current=request;updatedRef.current=onUpdated;
  const [status,setStatus]=useState<WorkStatus>(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[evidence,setEvidence]=useState(''),[pending,setPending]=useState(false);
  const {confirm,confirmation}=useStreamConfirm();
  const storageKey='hashpaylink:xstocks-agreement-pending:v1:'+identity;
  function assertCurrent(){if(!mounted.current||(current.current.identity!==identity||current.current.epoch!==epoch))throw Error('Your account or work agreement changed. Reopen it.');}
  async function api(extra:Record<string,unknown>={}){assertCurrent();const result=await requestRef.current({action:'work_xlayer_status',requestId:item.id,version:item.activeVersion,...extra}) as WorkStatus;assertCurrent();return result;}
  async function refresh(){const next=await api();setStatus(next);setPending(Boolean(localStorage.getItem(storageKey)));return next;}
  useEffect(()=>{mounted.current=true;lock.current=false;setStatus(undefined);setBusy('');setError('');setEvidence('');try{setPending(Boolean(localStorage.getItem(storageKey)))}catch{setPending(true);setError('Allow browser storage to keep payment recovery available.')}const update=()=>{if(!lock.current)void refresh().catch(e=>{if(mounted.current&&(current.current.identity===identity&&current.current.epoch===epoch))setError(e.message);});};update();const timer=setInterval(update,15000);return()=>{mounted.current=false;clearInterval(timer);};},[identity]);
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
    if(!wallet||!user?.id)throw Error('Your embedded wallet is not ready.');
    if(localStorage.getItem(storageKey))throw Error('Check your pending transaction first.');
    const plan=await api({operation,evidence}),tx=plan.transaction;
    if(!tx||tx.chainId!==196||tx.value!=='0'||getAddress(tx.account)!==getAddress(wallet.address)||plan.token?.toLowerCase()!==payment.token.toLowerCase()||plan.amount!==payment.amountUnits||plan.decimals!==payment.decimals)throw Error('The transaction does not match your accepted work payment.');
    await wallet.switchChain(196);assertCurrent();
    const record:Pending={transaction:tx};localStorage.setItem(storageKey,JSON.stringify(record));setPending(true);setBusy(labels[operation]);
    try{const result=await sendTransaction({to:tx.to,data:tx.data,value:0n,chainId:196},{address:wallet.address,uiOptions:{showWalletUIs:false}});record.hash=result.hash;localStorage.setItem(storageKey,JSON.stringify(record));assertCurrent();await reconcile(record);}
    catch(e){const code=(e as {code?:number;cause?:{code?:number}}).code??(e as {cause?:{code?:number}}).cause?.code;if(code===4001&&!record.hash){localStorage.removeItem(storageKey);if((current.current.identity===identity&&current.current.epoch===epoch))setPending(false);}throw e;}
  }
  async function run(action:TradeXLayerAction|'wallet'|'recover'){
    if(lock.current)return;lock.current=true;setBusy('Checking agreement');setError('');
    try{
      if(action==='wallet'){if(!wallet)throw Error('Your embedded wallet is not ready.');if(!await confirm({title:'Accept Agreement terms?',description:terms.amount+' '+workPaymentLabel(payment)+'. '+notice,action:'Accept terms'}))return;assertCurrent();await api({action:'work_xlayer_wallet',address:wallet.address});}
      else if(action==='recover'){const raw=localStorage.getItem(storageKey);if(raw)await reconcile(JSON.parse(raw));}
      else{
        const paying=action==='approve'||action==='fund';
        const description=isTrade?(paying?terms.amount+' '+workPaymentLabel(payment)+' will be held in escrow for the seller. Approval is limited to this payment; network fees are paid in OKB.':action==='receipt'?'Confirm receipt and start the '+payment.reviewHours+'-hour inspection period. The seller can claim payment after it ends unless a dispute is confirmed on-chain before the deadline.':action==='release'?'Release the full stock payment to the seller. This cannot be undone.':action==='dispatch'?'Record dispatch and its evidence. This does not prove delivery or release payment.':'Confirm '+labels[action].toLowerCase()+'. A network fee may apply.'):paying?terms.amount+' '+workPaymentLabel(payment)+' will be held for this work agreement and paid to '+(status?.workerAddress||'the worker')+'. Network fees are paid in OKB.':action==='receipt'?'Start the '+payment.reviewHours+'-hour review period. After it ends, the worker can claim payment unless you confirm a dispute on-chain before the deadline.':action==='release'?'Approve this work and release the full token payment to the worker. This cannot be undone.':action==='dispatch'?'Record your work submission and its evidence. This does not prove client approval or release payment.':'Confirm '+labels[action].toLowerCase()+'. A network fee may apply.';
        if(!await confirm({title:labels[action]+'?',description,action:paying?'Confirm payment':labels[action]}))return;assertCurrent();
        if(paying){let funded=false;for(let step=0;step<3;step++){const next=await api(),operation=next.actions.includes('fund')?'fund':next.actions.includes('approve')?'approve':undefined;if(!operation)throw Error('Payment state changed. Refresh.');await submit(operation);if(operation==='fund'){funded=true;break;}}if(!funded)throw Error('Approval completed. Refresh to continue.');}
        else await submit(action);
      }
    }catch(e){if((current.current.identity===identity&&current.current.epoch===epoch)&&mounted.current)setError((e as Error).message);}
    finally{if((current.current.identity===identity&&current.current.epoch===epoch)&&mounted.current){lock.current=false;setBusy('');await refresh().catch(e=>setError(e.message));updatedRef.current();}}
  }
  return <section className='mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-white/10' aria-label={isTrade?'Trade escrow':'Work escrow'}>
    {confirmation}<h3 className='text-sm font-bold'>{isTrade?'Trade payment':'Work payment'}</h3>
    <p className='text-sm font-bold'>{terms.amount} {workPaymentLabel(payment)}</p>
    <p className='text-xs text-gray-500'>{status?.pending?'Waiting for network confirmation':status?.state!==undefined?states[status.state]:status?'Accept the Agreement terms to prepare escrow.':'Checking Agreement...'}</p>
    <details className='text-xs text-gray-500'><summary className='min-h-8 cursor-pointer'>Accepted payment rules</summary><p>{notice}</p><p className='break-all'>Asset: {payment.token} · X Layer</p><p className='break-all'>{sellerLabel}: {status?.workerAddress||'Not confirmed'}</p><p className='break-all'>{buyerLabel}: {status?.clientAddress||'Not confirmed'}</p><p className='break-all'>Dispute arbitrator: {TRADE_XLAYER_ARBITER}</p>{status?.fundBy&&<p>Fund by {new Date(status.fundBy*1000).toLocaleString()}.</p>}</details>
    {status?.escrow&& !/^0x0{40}$/i.test(status.escrow)&&<a className='block text-xs underline' href={'https://www.oklink.com/xlayer/address/'+status.escrow} target='_blank' rel='noreferrer'>View escrow on X Layer</a>}
    {!wallet&&<p className='text-xs'>Your embedded wallet is not ready. Sign in again if it does not load.</p>}
    {status&&!status.wallet&&<button className={button} disabled={!!busy||!wallet||!status.enabled} onClick={()=>void run('wallet')}>Accept Agreement terms</button>}
    {status?.customerReady&&status.providerReady&&!status.pending&&status.state===undefined&&!status.actions.length&&<p className='text-xs text-gray-500'>Escrow creation is currently unavailable. Refresh to check the payment asset and funding deadline.</p>}
    {status?.wallet&&!(status.customerReady&&status.providerReady)&&<p className='text-xs'>Waiting for the other participant to confirm their wallet.</p>}
    {status?.actions.some(action=>['dispatch','refund','dispute'].includes(action))&&<label className='block text-xs'>{isTrade?'Delivery evidence or explanation':'Work link or explanation'}<textarea className='mt-1 w-full rounded-xl border bg-transparent p-3' minLength={10} maxLength={2000} value={evidence} disabled={!!busy} onChange={event=>setEvidence(event.target.value)}/></label>}
    {!!status?.workEvidence?.length&&<details className='text-xs'><summary>Shared evidence notes</summary><p className='text-gray-500'>Notes are saved before signing. A note alone is not proof of an on-chain submission.</p>{status.workEvidence.map(note=><p className='mt-2 whitespace-pre-wrap break-words' key={note.actor+note.hash}>{note.actor==='provider'?sellerLabel:buyerLabel}: {note.body}</p>)}</details>}
    {!pending&&status?.actions.map(action=><button key={action} className={button} disabled={!!busy||!wallet||status.wallet?.address.toLowerCase()!==wallet.address.toLowerCase()} onClick={()=>void run(action)}>{labels[action]}</button>)}
    {pending&&<button className={button} disabled={!!busy} onClick={()=>void run('recover')}>Check pending transaction</button>}
    {busy&&<p role='status' className='text-xs'>{busy}</p>}{error&&<p role='alert' className='text-xs text-red-600'>{error}</p>}
    <button className='block min-h-11 w-full text-center text-xs font-bold underline' disabled={!!busy} onClick={()=>void refresh().then(()=>updatedRef.current()).catch(e=>setError(e.message))}>Refresh agreement</button>
  </section>;
}
