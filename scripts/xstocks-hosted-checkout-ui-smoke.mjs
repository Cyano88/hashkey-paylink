import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(process.env.CHECKOUT_UI_TEST_MODULE_ROOT || import.meta.url);
const React=require('react'),TestRenderer=require('react-test-renderer'),{act}=TestRenderer;
const output=new URL('../.codex-temp/hosted-ui-test.mjs',import.meta.url);
Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_key,_options,callback)=>callback({})}},configurable:true});
globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.visibilityState='visible';
const address='0x'+'11'.repeat(20);
globalThis.__checkout={wallet:{address},confirm:async()=>false};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k),setItem:(k,v)=>storage.set(k,v)};
await build({entryPoints:['src/components/xstocksAgreement/HostedWorkCheckout.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:output.pathname.replace(/^\/([A-Za-z]:)/,'$1'),plugins:[{name:'wallet-fixtures',setup(b){b.onResolve({filter:/^react(\/jsx-runtime)?$/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));b.onResolve({filter:/(@privy-io\/react-auth|\/hostedWallet|\.\/ConfirmSheet)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('react-auth')?`export const usePrivy=()=>({authenticated:true,user:{id:'fixture'}}),useWallets=()=>({wallets:[]}),useSignTransaction=()=>({signTransaction:()=>{throw Error('Unexpected signing')}});`:a.path.includes('hostedWallet')?`export const selectHostedWallet=()=>globalThis.__checkout.wallet;`:`export const useStreamConfirm=()=>({confirm:(...a)=>globalThis.__checkout.confirm(...a),confirmation:null});` }));}}]});
try{
 const {default:Checkout}=await import(output.href);
 let readCount=0,waitForRead,fail=false,state=1,resolveConfirmation,receipt,settlement,operations=[],networkPending=false,fundingExpired=false;
 const request=async(body)=>{readCount++;if(body?.operation)operations.push(body);await waitForRead;if(fail)throw Error('upstream HTML');return {enabled:true,state,settlement,fundingExpired,pending:networkPending,stockReceipt:receipt,actions:state===0?['accept','cancel']:state===1?['approve','cancel']:state===2?['dispatch','refund']:state===3?['refund']:state===5?(settlement?.proposer===address?['proposeSettlement','withdrawSettlement']:['proposeSettlement','acceptSettlement']):[],wallet:{address},customerReady:true,providerReady:true}};
 const item={id:'fixture',activeVersion:1,role:'customer',terms:[{kind:'trade',version:1,amount:'0.00222',durationSeconds:86400,xlayerPayment:{token:'0xc845b2894dbddd03858fd2d643b4ef725fe0849d',decimals:18,amountUnits:'2220000000000000',reviewHours:48}}]};
 let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(Checkout,{item,request,onUpdated(){}}))});
 const buttons=()=>tree.root.findAllByType('button');const find=t=>buttons().find(b=>b.children.join('')===t);const text=()=>JSON.stringify(tree.toJSON());
 assert.ok(find('Pay securely'));assert.equal(find('Approve payment'),undefined);assert.equal(find('Refresh agreement'),undefined);assert.equal(find('Try again'),undefined);
 fail=true;await act(async()=>{window.dispatchEvent(new Event('focus'))});
 assert.equal(find('Pay securely'),undefined);assert.equal(find('Cancel payment'),undefined);assert.match(text(),/Payment status unavailable/);
 fail=false;await act(async()=>{await find('Try again').props.onClick()});assert.ok(find('Pay securely'));assert.doesNotMatch(text(),/Payment status unavailable/);
 globalThis.__checkout.confirm=()=>new Promise(r=>resolveConfirmation=r);
 await act(async()=>{find('Pay securely').props.onClick()});assert.equal(find('Pay securely'),undefined);assert.equal(find('Cancel payment'),undefined);assert.equal(buttons().filter(b=>b.props['aria-busy']).length,1,'progress stays in a single disabled CTA');assert.equal(buttons().find(b=>b.props['aria-busy']).props.disabled,true);
 await act(async()=>{resolveConfirmation(false)});assert.ok(find('Pay securely'));
 networkPending=true;await act(async()=>{window.dispatchEvent(new Event('focus'))});assert.equal(find('Pay securely'),undefined);assert.equal(buttons().filter(b=>b.props['aria-busy']).length,1);assert.match(text(),/Confirming transaction/);networkPending=false;
 state=0;item.role='provider';await act(async()=>{tree.update(React.createElement(Checkout,{item,request,onUpdated(){}}));window.dispatchEvent(new Event('focus'))});assert.ok(find('Confirm payment terms'));assert.equal((text().match(/Confirm payment terms/g)||[]).length,1,'next action appears once, not repeated as body status');item.role='customer';
 state=2;await act(async()=>{window.dispatchEvent(new Event('focus'))});assert.match(text(),/Payment held securely/);assert.equal(find('Pay securely'),undefined);assert.equal(find('Cancel payment'),undefined);
 assert.equal(find('Mark as sent').props.disabled,true);const beforeInvalid=readCount;await act(async()=>{await find('Mark as sent').props.onClick()});assert.equal(readCount,beforeInvalid,'Empty note must not call service');assert.match(text(),/Add a note of 10 to 2000 characters/);await act(async()=>{tree.root.findByType('textarea').props.onChange({target:{value:'Controlled test only - no physical item.'}})});assert.equal(find('Mark as sent').props.disabled,false);
 state=3;await act(async()=>{window.dispatchEvent(new Event('focus'))});assert.equal(tree.root.findAllByType('textarea').length,0,'Confirmed pickup hides note editor');const beforeRefund=readCount;await act(async()=>{find('Refund buyer').props.onClick()});assert.equal(readCount,beforeRefund,'Choosing a reason never prepares or sends a refund');assert.match(text(),/Refund reason/);assert.equal(tree.root.findByType('textarea').props.value,'','Never reuse pickup note as refund reason');assert.equal(find('Refund buyer').props.disabled,true);await act(async()=>{find('Cancel').props.onClick()});assert.equal(tree.root.findAllByType('textarea').length,0);
 // Proposals are reviewed explicitly; accepting keeps the exact reviewed proposal across the modal.
 state=5;settlement={nonce:'3',buyerAmount:'1110000000000000',evidence:'0x'+'bb'.repeat(32),proposer:'0x'+'22'.repeat(20)};
 await act(async()=>{window.dispatchEvent(new Event('focus'))});
 assert.ok(find('Accept split'));assert.equal(find('Withdraw proposal'),undefined);assert.match(text(),/Buyer allocation/);
 let reviewDialog;globalThis.__checkout.confirm=options=>{reviewDialog=options;return new Promise(r=>resolveConfirmation=r)};
 await act(async()=>{find('Accept split').props.onClick()});assert.match(reviewDialog.description,/0.00111/);assert.match(reviewDialog.description,/cannot be undone/);
 settlement={...settlement,nonce:'4',buyerAmount:'0'};
 await act(async()=>{resolveConfirmation(true)});assert.equal(operations.at(-1).settlement.nonce,'3');assert.equal(operations.at(-1).settlement.buyerAmount,'1110000000000000');
 await act(async()=>{await find('Try again').props.onClick()});
 globalThis.__checkout.confirm=async()=>false;
 await act(async()=>{find('Propose a split').props.onClick()});assert.equal(find('Propose a split').props.disabled,true);
 await act(async()=>{tree.root.findByType('textarea').props.onChange({target:{value:'Agreed split for this controlled test'}});tree.root.findByType('input').props.onChange({target:{value:'0.0000000000000000001'}})});
 const beforeInvalidProposal=operations.length;await act(async()=>{await find('Propose a split').props.onClick()});assert.equal(operations.length,beforeInvalidProposal);assert.match(text(),/exact stock quantity/);
 await act(async()=>{find('Cancel').props.onClick()});await act(async()=>{await find('Try again')?.props.onClick()});
 settlement={...settlement,proposer:address};await act(async()=>{window.dispatchEvent(new Event('focus'))});assert.ok(find('Withdraw proposal'));assert.equal(find('Accept split'),undefined);
 settlement=undefined;
 receipt={fundedShares:'2216229757026900',currentUnderlyingUnits:'0',buyerUnderlyingAtSettlement:'0',sellerUnderlyingAtSettlement:'2219999999999999',buyerSettledShares:'0',sellerSettledShares:'2216229757026900',observedBlock:'100'};
 state=6;await act(async()=>{window.dispatchEvent(new Event('focus'))});
 assert.match(text(),/Paid to seller/);assert.match(text(),/0.00222/);assert.doesNotMatch(text(),/Refunded to you/);
 const details=tree.root.findAllByType('details').find(d=>JSON.stringify(d.toJSON?.()||d.findAllByType('summary').map(n=>n.children)).includes('Transaction details'));
 assert.ok(details);assert.equal(details.props.open,undefined,'Exact records are collapsed by default');
 for(const role of ['customer','provider']){
   item.role=role;state=7;receipt={...receipt,buyerUnderlyingAtSettlement:'2220000000000000',buyerSettledShares:'2216229757026900',sellerUnderlyingAtSettlement:'0',sellerSettledShares:'0'};
   item.id='refund-'+role;await act(async()=>tree.update(React.createElement(Checkout,{item,request,onUpdated(){}})));
   assert.match(text(),role==='customer'?/Refunded to you/:/Refunded to buyer/);assert.doesNotMatch(text(),/Paid to seller|Payment held/);
 }
 state=8;item.id='split';receipt={...receipt,sellerUnderlyingAtSettlement:'1110000000000000',sellerSettledShares:'1108114878513450',buyerUnderlyingAtSettlement:'1110000000000000',buyerSettledShares:'1108114878513450'};
 await act(async()=>tree.update(React.createElement(Checkout,{item,request,onUpdated(){}})));assert.match(text(),/You received/);assert.match(text(),/Refunded to buyer/);
 state=6;item.id='complete';item.role='customer';receipt={...receipt,buyerSettledShares:'0',sellerSettledShares:'2216229757026900'};
 await act(async()=>tree.update(React.createElement(Checkout,{item,request,onUpdated(){}})));
 const afterFinal=readCount;fail=true;await act(async()=>{window.dispatchEvent(new Event('focus'))});assert.equal(readCount,afterFinal,'Verified final receipts stop background polling');assert.match(text(),/Paid to seller/);assert.doesNotMatch(text(),/Payment status unavailable/);assert.equal(find('Try again'),undefined);fail=false;
 // A different agreement must still load and poll normally.
 state=1;receipt=undefined;item.id='another-agreement';await act(async()=>{tree.update(React.createElement(Checkout,{item,request,onUpdated(){}}))});assert.ok(find('Pay securely'));
 for(const role of ['customer','provider']){
  item.role=role;state=undefined;fundingExpired=true;item.id='expired-'+role;
  await act(async()=>tree.update(React.createElement(Checkout,{item,request,onUpdated(){}})));
  assert.match(text(),/Payment deadline passed/);assert.match(text(),/agree fresh terms/);
  assert.doesNotMatch(text(),/temporarily unavailable|Waiting for seller setup|Ready to set up payment/);
  assert.equal(find('Set up payment'),undefined);assert.equal(find('Pay securely'),undefined);
 }
 fundingExpired=false;state=1;item.id='active-again';
 await act(async()=>tree.update(React.createElement(Checkout,{item,request,onUpdated(){}})));
 const beforeHidden=readCount;document.visibilityState='hidden';await act(async()=>{window.dispatchEvent(new Event('focus'))});assert.equal(readCount,beforeHidden);
 document.visibilityState='visible';let finishRead;waitForRead=new Promise(resolve=>finishRead=resolve);
 await act(async()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'))});assert.equal(readCount,beforeHidden+1,'Only one background request at a time');
 await act(async()=>{finishRead()});waitForRead=undefined;
 await act(async()=>tree.unmount());console.log('Hosted checkout UI passed: stale status blocks actions, refresh recovers, processing hides CTAs, funded state removes unpaid actions.');
}finally{await unlink(output)}
