import { stockIntrinsicGasFloor, stockActionError, validateSignedStockTransaction, type PendingStockTransaction } from '../../lib/xstocksAgreement/transactionRecovery';
import StockPaymentReceipt from './StockPaymentReceipt';
import { selectHostedWallet } from '../../lib/xstocksAgreement/hostedWallet';
// Signing/reconciliation adapted from PrivyTradeCheckout; work terms remain independent.
import { useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets, useSignTransaction } from '@privy-io/react-auth';
import { createPublicClient, formatUnits, parseUnits, getAddress, http, keccak256 } from 'viem';
import { useStreamConfirm } from './ConfirmSheet';
import type { HostedWorkItem as ServiceRequest } from '../../lib/xstocksAgreement/hostedClient';
import { WORK_ACTION_LABELS, WORK_STATES, workPaymentLabel, workTermsNotice } from '../../lib/xstocksAgreement/workXLayer';
import { SHARE_CUSTODY_NOTICE, TRADE_XLAYER_ARBITER, TRADE_ACTION_LABELS, type SettlementReview, type TradeXLayerAction, type TradeXLayerStatus, type TradeXLayerTransaction } from '../../lib/xstocksAgreement/protocol';
const rpc=createPublicClient({transport:http('https://rpc.xlayer.tech',{timeout:15000,retryCount:1})});
const button='block min-h-11 w-full rounded-full bg-gray-950 px-4 text-xs font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950';
type WorkStatus=TradeXLayerStatus&{wallet:{address:string}|null;clientAddress?:string;workerAddress?:string;customerReady:boolean;providerReady:boolean;fundBy?:number;workEvidence?:Array<{hash:string;body:string;actor:string;createdAt:string}>};
type Pending=PendingStockTransaction;
export default function HostedWorkCheckout({item,request,onUpdated}:{item:ServiceRequest;request(payload:Record<string,unknown>):Promise<unknown>;onUpdated():void}){
  const {user,authenticated}=usePrivy(),{wallets}=useWallets(),{signTransaction}=useSignTransaction();
  const wallet=selectHostedWallet(authenticated,user,wallets);
  const terms=item.terms.find(term=>term.version===item.activeVersion)!,payment=terms.xlayerPayment!;
  const isTrade=terms.kind==='trade',labels=isTrade?{...TRADE_ACTION_LABELS,create:'Set up payment',accept:'Confirm payment terms',dispatch:terms.trade?.handover==='Pickup'?'Mark ready for pickup':'Mark as sent',receipt:'Confirm received',cancel:'Cancel payment'}:WORK_ACTION_LABELS;
  const sellerLabel=isTrade?'Seller':'Worker',buyerLabel=isTrade?'Buyer':'Client';
  const notice=isTrade&&terms.trade?'Dispatch within '+terms.trade.dispatchDays+' days after funding. Delivery window: '+terms.trade.deliveryDays+' days after dispatch. Confirming receipt starts a '+terms.trade.inspectionHours+'-hour inspection period. The seller can claim payment after inspection unless a dispute is confirmed on-chain before the deadline. Missed dispatch permits a buyer refund. After dispatch, the seller can open a dispute once the delivery window ends. The seller may voluntarily refund. '+(terms.stockCustody?SHARE_CUSTODY_NOTICE:'The stock quantity stays fixed even if its dollar value changes.')+'':workTermsNotice(terms.durationSeconds,payment);
  const states=isTrade?['Waiting for seller','Ready to pay','Payment held securely',terms.trade?.handover==='Pickup'?'Ready for pickup':'Sent by seller',item.role==='customer'?'Your review period':'Buyer review period','Disputed','Payment released','Refunded','Dispute resolved','Cancelled']:WORK_STATES;
  const identity=[user?.id,item.id,item.activeVersion,wallet?.address.toLowerCase()].join(':');
  const current=useRef({identity,epoch:0});if(current.current.identity!==identity)current.current={identity,epoch:current.current.epoch+1};const epoch=current.current.epoch;
  const mounted=useRef(true),lock=useRef(false),requestRef=useRef(request),updatedRef=useRef(onUpdated);requestRef.current=request;updatedRef.current=onUpdated;
  const refreshVersion=useRef(0),background=useRef<Promise<unknown>|null>(null);
  const [loadError,setLoadError]=useState('');
  const [status,setStatus]=useState<WorkStatus>(),[busy,setBusy]=useState(''),[error,setError]=useState(''),[evidence,setEvidence]=useState(''),[pending,setPending]=useState(false);
  const verifiedFinal=useRef(false);
  const [noteAction,setNoteAction]=useState<'refund'|'dispute'|'proposeSettlement'>();
  useEffect(()=>{setNoteAction(undefined);setEvidence('');},[identity,status?.state]);
  const [buyerAmount,setBuyerAmount]=useState('');
  const editingNote=noteAction||(status?.actions.includes('dispatch')?'dispatch':undefined);
  const {confirm,confirmation}=useStreamConfirm();
  const [reviewing,setReviewing]=useState(false);
  async function review(options:Parameters<typeof confirm>[0]){setReviewing(true);try{return await confirm(options);}finally{setReviewing(false);}}
  useEffect(()=>{if(!status?.pending){setNoteAction(undefined);setEvidence('');setBuyerAmount('');}},[identity,status?.pending,status?.settlement?.nonce]);
  const storageKey='hashpaylink:xstocks-agreement-pending:v1:'+identity;
  function assertCurrent(){if(!mounted.current||(current.current.identity!==identity||current.current.epoch!==epoch))throw Error('Your account or agreement changed. Please reopen it.');}
  async function api(extra:Record<string,unknown>={}){assertCurrent();const result=await requestRef.current({action:'work_xlayer_status',requestId:item.id,version:item.activeVersion,...extra}) as WorkStatus;assertCurrent();return result;}
  async function refresh(clearActionError=false){const version=++refreshVersion.current;try{const next=await api();if(version===refreshVersion.current){setStatus(next);verifiedFinal.current=!next.pending&&next.state!==undefined&&[6,7,8,9].includes(next.state)&&!!(next.observedBlock||next.stockReceipt?.observedBlock);setLoadError('');if(clearActionError)setError('');setPending(Boolean(localStorage.getItem(storageKey)));}return next;}catch(e){if(!verifiedFinal.current&&version===refreshVersion.current&&mounted.current&&current.current.identity===identity&&current.current.epoch===epoch)setLoadError('We couldn’t check your payment. Try again.');throw e;}}
  useEffect(()=>{mounted.current=true;lock.current=false;verifiedFinal.current=false;++refreshVersion.current;setStatus(undefined);setBusy('');setError('');setLoadError('');setEvidence('');try{setPending(Boolean(localStorage.getItem(storageKey)))}catch{setPending(true);setError('Allow browser storage to keep payment recovery available.')}const update=()=>{if(verifiedFinal.current||lock.current||background.current||(typeof document!=='undefined'&&document.visibilityState==='hidden'))return;const read=refresh().catch(()=>{});background.current=read;void read.finally(()=>{if(background.current===read)background.current=null;});};background.current=null;update();const timer=setInterval(update,15000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{mounted.current=false;++refreshVersion.current;clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[identity]);
  async function reconcile(record:Pending){
    if(!record.hash)throw Error('Submission is uncertain. Check wallet activity before retrying; another payment will not be sent.');
    if(record.transaction.account.toLowerCase()!==wallet?.address.toLowerCase())throw Error('Reopen checkout with the payment account.');
    if(record.serialized)await validateSignedStockTransaction(record);
    setBusy('Confirming transaction...');
    const receipt=await rpc.waitForTransactionReceipt({hash:record.hash,confirmations:3,timeout:90000});assertCurrent();
    if(receipt.transactionHash.toLowerCase()!==record.hash.toLowerCase())throw Error('Transaction was replaced. Review wallet activity.');
    const tx=await rpc.getTransaction({hash:record.hash});assertCurrent();
    if(await rpc.getChainId()!==196)throw Error('Payment network mismatch.');assertCurrent();
    if(getAddress(tx.from)!==getAddress(record.transaction.account)||tx.to?.toLowerCase()!==record.transaction.to.toLowerCase()||tx.input!==record.transaction.data||tx.value!==0n)throw Error('Transaction verification failed.');
    localStorage.removeItem(storageKey);setPending(false);
    if(receipt.status!=='success')throw Error('The transaction reverted. No payment was completed.');
    if(record.operation==='proposeSettlement'){setNoteAction(undefined);setEvidence('');setBuyerAmount('');}
  }
  async function submit(operation:TradeXLayerAction,settlement?:SettlementReview){
    if(!wallet||!user?.id)throw Error('Your payment wallet is still loading. Please try again.');
    if(localStorage.getItem(storageKey))throw Error('Check your pending transaction first.');
    const plan=await api({operation,evidence,settlement}),tx=plan.transaction;
    if(!tx||tx.chainId!==196||tx.value!=='0'||getAddress(tx.account)!==getAddress(wallet.address)||plan.token?.toLowerCase()!==payment.token.toLowerCase()||plan.amount!==payment.amountUnits||plan.decimals!==payment.decimals)throw Error('The payment details do not match this agreement. Reopen checkout.');
    await wallet.switchChain(196);assertCurrent();
    const record:Pending={transaction:tx,operation,evidence,settlement};setBusy(operation==='approve'?'Approving payment...':operation==='fund'?'Sending payment...':operation==='create'?'Setting up payment...':operation==='accept'?'Confirming payment terms...':'Confirming '+labels[operation].toLowerCase()+'...');
    // Sign-only cannot send funds. Interrupted preparation/signing leaves no ambiguous pending entry.
    let signTimer:ReturnType<typeof setTimeout>|undefined;
    const [estimatedGas,gasPrice,nonce]=await Promise.all([
      rpc.estimateGas({account:tx.account,to:tx.to,data:tx.data,value:0n}),
      rpc.getGasPrice(),rpc.getTransactionCount({address:tx.account,blockTag:'pending'})
    ]);assertCurrent();
    const gasLimit=(estimatedGas*120n+99n)/100n;
    if(gasLimit<stockIntrinsicGasFloor(tx.data))throw Error('The network could not prepare this action. Please try again.');
    const signing=signTransaction({to:tx.to,data:tx.data,value:0n,chainId:196,type:0,gasLimit,gasPrice,nonce},{address:wallet.address,uiOptions:{showWalletUIs:false}});
    const result=await Promise.race([signing,new Promise<never>((_,reject)=>{signTimer=setTimeout(()=>reject(Error('Signing timed out. Nothing was sent. Please try again.')),60000)})]).finally(()=>clearTimeout(signTimer));
    assertCurrent();
    record.serialized=result.signature;record.hash=keccak256(result.signature);
    const signed=await validateSignedStockTransaction(record);assertCurrent();
    if(signed.gas!==gasLimit||signed.gasPrice!==gasPrice||signed.nonce!==nonce)throw Error('Wallet preparation changed. Please try again.');
    localStorage.setItem(storageKey,JSON.stringify(record));setPending(true);
    // Persistence must succeed before the first broadcast. Network failures retain this exact intent.
    try{await rpc.sendRawTransaction({serializedTransaction:record.serialized});}catch{ /* Reconcile by deterministic hash even if the RPC response was lost. */ }
    await reconcile(record);
  }
  async function runExclusive(action:TradeXLayerAction|'wallet'|'recover'){
    if(lock.current)return;
    if(['dispatch','refund','dispute','proposeSettlement'].includes(action)&&(evidence.trim().length<10||evidence.length>2000)){setError('Add a note of 10 to 2000 characters before continuing.');return;}
    ++refreshVersion.current;lock.current=true;setBusy('Checking payment...');setError('');
    let actionStarted=false;
    try{
      if(action==='wallet'){if(!wallet)throw Error('Your payment wallet is still loading. Please try again.');if(!await review({title:'Accept payment terms?',description:terms.amount+' '+workPaymentLabel(payment)+'. '+notice,action:'Accept terms'}))return;assertCurrent();actionStarted=true;await api({action:'work_xlayer_wallet',address:wallet.address});}
      else if(action==='recover'){
        actionStarted=true;
        const raw=localStorage.getItem(storageKey);
        if(raw){
          const record:Pending=JSON.parse(raw);
          if(record.serialized){
            const signed=await validateSignedStockTransaction(record);assertCurrent();
            if((signed.gas??0n)<stockIntrinsicGasFloor(record.transaction.data)){
              localStorage.removeItem(storageKey);setPending(false);
              throw Error('The previous setup could not be sent. Please try the action again.');
            }
            if(record.transaction.account.toLowerCase()!==wallet?.address.toLowerCase())throw Error('Reopen checkout with the payment account.');
            let known=false;
            try{await rpc.getTransaction({hash:record.hash!});known=true;}catch(e){if((e as {name?:string}).name!=='TransactionNotFoundError')throw e;}
            if(!known){
              if(!record.operation)throw Error('Saved action needs review before it can continue.');
              if(record.settlement && (record.operation==='acceptSettlement'||record.operation==='withdrawSettlement')){
                const currentStatus=await api();
                const final=currentStatus.state!==undefined&&[6,7,8,9].includes(currentStatus.state);
                const changed=currentStatus.state===5&&currentStatus.settlement&&(BigInt(currentStatus.settlement.nonce)>BigInt(record.settlement.nonce)||currentStatus.settlement.nonce===record.settlement.nonce&&/^0x0{40}$/i.test(currentStatus.settlement.proposer));
                if(!currentStatus.pending&&currentStatus.observedBlock&&(final||changed)){
                  // This signed proposal can no longer succeed. Retain it for diagnostics,
                  // but never rebroadcast it or leave the checkout locked behind it.
                  localStorage.setItem(storageKey+':obsolete',raw);localStorage.removeItem(storageKey);setPending(false);
                  throw Error('That proposal is no longer available. Review the current payment status.');
                }
              }
              const plan=await api({operation:record.operation,evidence:record.evidence||'',settlement:record.settlement}),next=plan.transaction;
              if(!next||next.to.toLowerCase()!==record.transaction.to.toLowerCase()||next.data!==record.transaction.data||next.account.toLowerCase()!==record.transaction.account.toLowerCase()||next.chainId!==196||next.value!=='0'||plan.token?.toLowerCase()!==payment.token.toLowerCase()||plan.amount!==payment.amountUnits||plan.decimals!==payment.decimals)
                throw Error('Payment details changed. This saved action was not sent.');
              if(!await review({title:'Resume this action?',description:'Continue the exact transaction you already approved. This will not create a second payment.',action:'Resume action'}))return;
              assertCurrent();
              try{await rpc.sendRawTransaction({serializedTransaction:record.serialized});}catch{ /* The network may already have it. Verify the saved hash below. */ }
            }
          }
          await reconcile(record);
        }
      }
      else{
        let reviewed:SettlementReview|undefined;
        let splitDescription='';
        if(['proposeSettlement','withdrawSettlement','acceptSettlement'].includes(action)){
          if(!status?.settlement)throw Error('Refresh to review the current proposal.');
          reviewed={...status.settlement};
          if(action==='proposeSettlement'){
            if(!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(buyerAmount)||(buyerAmount.split('.')[1]?.length||0)>payment.decimals)throw Error('Enter an exact stock quantity for the buyer.');
            const units=parseUnits(buyerAmount,payment.decimals);
            if(units>BigInt(payment.amountUnits))throw Error('The buyer amount cannot exceed the agreed payment.');
            reviewed.buyerAmount=units.toString();
          }
          splitDescription='Buyer allocation: '+formatUnits(BigInt(reviewed.buyerAmount),payment.decimals)+'; seller allocation: '+formatUnits(BigInt(payment.amountUnits)-BigInt(reviewed.buyerAmount),payment.decimals)+' '+workPaymentLabel(payment)+'. These agreed quantities set the proportion of held shares; the current stock equivalent may differ. Any fractional share remainder goes to the seller. '+(action==='acceptSettlement'?'Accepting releases both allocations and cannot be undone.':action==='withdrawSettlement'?'Withdraw your proposal. The payment stays held.':'The payment stays held until the other person accepts.');
        }
        const paying=action==='approve'||action==='fund';
        const description=isTrade?(paying?terms.amount+' '+workPaymentLabel(payment)+' will be held securely until it can be released under the agreed terms. Your wallet may ask for permission first, then payment. Network fees are paid in OKB.':action==='receipt'?'Confirm receipt and start the '+payment.reviewHours+'-hour inspection period. The seller can claim payment after it ends unless a dispute is confirmed on-chain before the deadline.':action==='release'?'Release the full stock payment to the seller. This cannot be undone.':action==='dispatch'?(terms.trade?.handover==='Pickup'?'Let the buyer know the item is ready for pickup.':'Let the buyer know the item has been sent.')+' Your note will be saved. Payment stays held until release.':(action==='create'?'Set up a secure payment for this agreement. This does not take payment yet.':action==='accept'?'Confirm the agreed amount and terms so the buyer can pay.':action==='cancel'?'Cancel this unpaid agreement. No stock payment will be taken.':action==='refund'?'Return the held payment to the buyer. This cannot be undone.':action==='dispute'?'Ask for help resolving this agreement. Payment stays held until the dispute is resolved.': 'Continue with '+labels[action].toLowerCase()+'.')+' A network fee may apply.'):paying?terms.amount+' '+workPaymentLabel(payment)+' will be held for this work agreement and paid to '+(status?.workerAddress||'the worker')+'. Network fees are paid in OKB.':action==='receipt'?'Start the '+payment.reviewHours+'-hour review period. After it ends, the worker can claim payment unless you confirm a dispute on-chain before the deadline.':action==='release'?'Approve this work and release the full token payment to the worker. This cannot be undone.':action==='dispatch'?'Record your work submission and its evidence. This does not prove client approval or release payment.':'Confirm '+labels[action].toLowerCase()+'. A network fee may apply.';
        if(!await review({title:(paying?'Pay securely':labels[action])+'?',description:(splitDescription||description)+(paying&&terms.stockCustody?' The stock quantity can change if its issuer adjusts the shares. In a split payment, any fractional share remainder goes to the seller.':''),action:paying?'Confirm payment':labels[action]}))return;assertCurrent();
        actionStarted=true;
        if(paying){let funded=false;for(let step=0;step<3;step++){const next=await api(),operation=next.actions.includes('fund')?'fund':next.actions.includes('approve')?'approve':undefined;if(!operation)throw Error('Payment state changed. Refresh.');await submit(operation);if(operation==='fund'){funded=true;break;}}if(!funded)throw Error('Approval completed. Refresh to continue.');}
        else await submit(action,reviewed);
      }
    }catch(e){if((current.current.identity===identity&&current.current.epoch===epoch)&&mounted.current)setError(stockActionError(e,Boolean(localStorage.getItem(storageKey))));}
    finally{if((current.current.identity===identity&&current.current.epoch===epoch)&&mounted.current){if(actionStarted)await refresh().catch(()=>{});if(current.current.identity===identity&&current.current.epoch===epoch&&mounted.current){lock.current=false;setBusy('');if(actionStarted)updatedRef.current();}}}
  }
  async function run(action:TradeXLayerAction|'wallet'|'recover'){
    if(!navigator.locks){setError('Use an up-to-date browser to continue securely.');return;}
    await navigator.locks.request('hpl-stock:'+identity,{ifAvailable:true},async held=>{
      if(!held){setError('This checkout is already open for an action in another tab. Finish it there first.');return;}
      await runExclusive(action);
    });
  }
  return <section className='mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-white/10' aria-label={isTrade?'Trade escrow':'Work escrow'}>
    {confirmation}<h3 className='text-sm font-bold'>{isTrade?'Trade payment':'Work payment'}</h3>
    <p className='text-sm font-bold'>{terms.amount} {workPaymentLabel(payment)}</p>
    {!busy&&!pending&&!status?.pending&&status&&(loadError||status.fundingExpired||status.fundingIssue||(status.state!==undefined&&status.state>=2)||(!status.actions.length&&!!status.wallet))&&<p role='status' aria-live='polite' className='inline-flex rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-900 dark:bg-white/10 dark:text-white'>{loadError?'Payment status unavailable':status.fundingExpired?'Payment deadline passed':status.fundingIssue?'Stock payment unavailable':status.state!==undefined?(status.state===0&&item.role==='provider'?'Confirm payment terms':states[status.state]):!status.wallet?'Review payment terms':!status.customerReady||!status.providerReady?'Waiting for the other account':item.role==='customer'?'Waiting for seller setup':'Ready to set up payment'}</p>}
    <details className='text-xs text-gray-500'><summary className='min-h-8 cursor-pointer'>Payment terms</summary><p>{notice}</p><p className='break-all'>Asset: {payment.token} · X Layer</p><p className='break-all'>{sellerLabel}: {status?.workerAddress||'Not confirmed'}</p><p className='break-all'>{buyerLabel}: {status?.clientAddress||'Not confirmed'}</p><p className='break-all'>Dispute reviewer: {TRADE_XLAYER_ARBITER}</p>{status?.fundBy&&<p>Fund by {new Date(status.fundBy*1000).toLocaleString()}.</p>}</details>
    {(!status?.stockReceipt||status.stockReceipt.fundedShares==='0')&&status?.escrow&& !/^0x0{40}$/i.test(status.escrow)&&<a className='block text-xs underline' href={'https://www.oklink.com/xlayer/address/'+status.escrow} target='_blank' rel='noreferrer'>View transaction details</a>}
    {status?.fundingExpired&&!loadError&&!pending&&!busy&&<p className='text-sm text-gray-600 dark:text-gray-300'>The time to pay has ended. Return to {isTrade?'Trade':'your agreement'} to agree fresh terms before paying.</p>}
    {status?.fundingIssue&&<p role='alert' className='text-xs text-red-600'>{status.fundingIssue}</p>}
    {status&&<StockPaymentReceipt status={status} decimals={payment.decimals} label={workPaymentLabel(payment)} role={item.role}/>}
    {!wallet&&<p className='text-xs'>Your payment wallet is loading. Sign in again if it does not load.</p>}
    {!reviewing&&(busy||(!pending&&!loadError&&!error&&(!status||status.pending)))&&<button type='button' className={button+' flex items-center justify-center gap-2 disabled:opacity-100'} disabled aria-busy='true'><span aria-hidden='true' className='h-4 w-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin'/><span role='status' aria-live='polite'>{busy||(!status?'Checking payment...':'Confirming transaction...')}</span></button>}
    {!busy&&!pending&&!loadError&&status&&!status.wallet&&<button className={button} disabled={!!busy||!wallet||!status.enabled} onClick={()=>void run('wallet')}>Accept payment terms</button>}
    {item.role==='provider'&&!status?.fundingExpired&&!status?.fundingIssue&&status?.customerReady&&status.providerReady&&!status.pending&&status.state===undefined&&!status.actions.length&&<p className='text-xs text-gray-500'>Payment setup is temporarily unavailable. Please try again.</p>}
    {status?.wallet&&!(status.customerReady&&status.providerReady)&&<p className='text-xs'>Waiting for the other person to accept the payment terms.</p>}
    {isTrade&&status?.state===5&&status.settlement&&<div className='space-y-2 text-sm' aria-label='Dispute settlement'>
      {/^0x0{40}$/i.test(status.settlement.proposer)?<p>No split proposed yet. Payment stays held.</p>:<>
        <p>{status.settlement.proposer.toLowerCase()===wallet?.address.toLowerCase()?'Your proposal':'Proposal from the other person'}</p>
        <p>Buyer allocation: {formatUnits(BigInt(status.settlement.buyerAmount),payment.decimals)} {workPaymentLabel(payment)}</p>
        <p>Seller allocation: {formatUnits(BigInt(payment.amountUnits)-BigInt(status.settlement.buyerAmount),payment.decimals)} {workPaymentLabel(payment)}</p>
        <p className='text-xs text-gray-500'>These quantities set the split of held shares. The current stock equivalent may differ.</p>
        {status.workEvidence?.filter(note=>note.hash===status.settlement!.evidence).map(note=><p className='whitespace-pre-wrap break-words' key={note.actor+note.hash}>{note.body}</p>)}
      </>}
      {noteAction==='proposeSettlement'&&<label className='block'>Buyer allocation ({workPaymentLabel(payment)})<input className='mt-1 w-full rounded-xl border bg-transparent p-3' inputMode='decimal' maxLength={80} value={buyerAmount} disabled={!!busy} onChange={event=>setBuyerAmount(event.target.value)}/><span className='block text-xs text-gray-500'>Enter zero for a full seller payment, or {terms.amount} for a full buyer refund. The remainder goes to the seller.</span></label>}
    </div>}
    {editingNote&&status?.actions.includes(editingNote)&&<label className='block text-xs'>{editingNote==='proposeSettlement'?'Proposal note':editingNote==='refund'?'Refund reason':editingNote==='dispute'?'Dispute reason':isTrade?'Delivery or pickup note':'Work link or explanation'}<span className='mt-1 block text-gray-500'>Add a note of at least 10 characters.</span><textarea required className='mt-1 w-full rounded-xl border bg-transparent p-3' minLength={10} maxLength={2000} value={evidence} disabled={!!busy} onChange={event=>setEvidence(event.target.value)}/></label>}
    {!!status?.workEvidence?.length&&<details className='text-xs'><summary>Shared notes</summary><p className='text-gray-500'>Notes are saved before confirmation. Check the payment status to see whether an action completed.</p>{status.workEvidence.map(note=><p className='mt-2 whitespace-pre-wrap break-words' key={note.actor+note.hash}>{note.actor==='provider'?sellerLabel:buyerLabel}: {note.body}</p>)}</details>}
    {!busy&&!pending&&!loadError&&!status?.pending&&status?.actions.filter(action=>!noteAction||action===noteAction).map(action=><button key={action} className={action==='cancel'?'block min-h-11 w-full text-xs text-gray-500 underline disabled:opacity-40':button} disabled={!!busy||!wallet||status.wallet?.address.toLowerCase()!==wallet.address.toLowerCase()||(action===editingNote&&(evidence.trim().length<10||evidence.length>2000))} onClick={()=>{if((action==='refund'||action==='dispute'||action==='proposeSettlement')&&noteAction!==action){setEvidence('');setError('');setNoteAction(action);if(action==='proposeSettlement')setBuyerAmount('');}else void run(action);}}>{action==='approve'||action==='fund'?'Pay securely':labels[action]}</button>)}
    {noteAction&&!busy&&!pending&&<button type='button' className='block min-h-11 w-full text-xs font-semibold' onClick={()=>{setNoteAction(undefined);setEvidence('');setError('');}}>Cancel</button>}
    {pending&&!busy&&<button className={button} disabled={!!busy} onClick={()=>void run('recover')}>Check pending transaction</button>}
    {loadError&&!pending&&!error&&<p role='alert' className='text-xs text-red-600'>{loadError}</p>}{error&&<p role='alert' className='break-words text-xs text-red-600'>{error}</p>}
    {!pending&&(loadError||error)&&<button className='block min-h-11 w-full text-center text-xs font-bold underline' disabled={!!busy} onClick={()=>void refresh(true).then(()=>updatedRef.current()).catch(()=>{})}>Try again</button>}
  </section>;
}
