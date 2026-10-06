import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {createRequire} from 'node:module';
const testRequire=createRequire(process.env.HASHPAYLINK_TEST_RUNTIME_PACKAGE||new URL('../package.json',import.meta.url));
const React=testRequire('react'),TestRenderer=testRequire('react-test-renderer'),{act}=TestRenderer;
import {getAddress,keccak256,formatUnits,parseUnits} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {stockIntrinsicGasFloor,stockActionError,validateSignedStockTransaction} from '../src/lib/xstocksAgreement/transactionRecovery.ts';
const account=privateKeyToAccount('0x'+'11'.repeat(32));
import {WORK_ACTION_LABELS,WORK_STATES,workPaymentLabel,workTermsNotice,WORK_USDC} from '../src/lib/xstocksAgreement/workXLayer.ts';
import {TRADE_XLAYER_ARBITER,TRADE_ACTION_LABELS} from '../src/lib/xstocksAgreement/protocol.ts';
const source=fs.readFileSync('src/components/xstocksAgreement/HostedWorkCheckout.tsx','utf8').replace(/^import .*\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const address=account.address,worker=getAddress('0x'+'22'.repeat(20)),escrow=getAddress('0x'+'33'.repeat(20)),initialHash='0x'+'aa'.repeat(32);let hash=initialHash;
let user='a',stage='approve',signs=[],consent=true,confirmCalls=0,sendError,lastTx,resolveConfirm,mismatch=false;
const storage=new Map(),payment={policy:'work-xlayer-v1',chainId:196,token:WORK_USDC,decimals:6,amountUnits:'1234567',reviewHours:48,responseDays:7};
const props={item:{id:'work-test',activeVersion:1,role:'customer',terms:[{version:1,title:'Test work',amount:'1.234567',durationSeconds:86400,xlayerPayment:payment}]},onUpdated(){},request:async body=>({enabled:true,state:stage==='done'?2:1,actions:stage==='done'?[]:[stage],wallet:{address},customerReady:true,providerReady:true,workerAddress:worker,amount:mismatch?'1':'1234567',token:WORK_USDC,decimals:6,...(body.operation?{transaction:{account:address,to:body.operation==='approve'?WORK_USDC:escrow,data:'0x1234',chainId:196,value:'0'}}:{})})};
const context={exports:{},stockIntrinsicGasFloor,stockActionError,validateSignedStockTransaction,keccak256,formatUnits,parseUnits,selectHostedWallet:(_,__,wallets)=>wallets[0],StockPaymentReceipt:()=>null,TRADE_ACTION_LABELS,React,...React,getAddress,WORK_ACTION_LABELS,WORK_STATES,workPaymentLabel,workTermsNotice,TRADE_XLAYER_ARBITER,
 usePrivy:()=>({authenticated:true,user:{id:user}}),useWallets:()=>({ready:true,wallets:[{walletClientType:'privy',address,switchChain:async c=>assert.equal(c,196)}]}),
 useSignTransaction:()=>({signTransaction:async(tx,options)=>{signs.push({tx,options});lastTx=tx;const signature=await account.signTransaction({...tx,type:'legacy',gas:tx.gasLimit});hash=keccak256(signature);return {signature};}}),
 useStreamConfirm:()=>({confirmation:null,confirm:async()=>{confirmCalls++;return consent==='wait'?new Promise(resolve=>{resolveConfirm=resolve}):consent;}}),
 http:()=>null,createPublicClient:()=>({getChainId:async()=>196,estimateGas:async()=>50000n,getGasPrice:async()=>1n,getTransactionCount:async()=>0,sendRawTransaction:async()=>{if(sendError)throw sendError;stage=stage==='approve'?'fund':'done';return hash},waitForTransactionReceipt:async()=>{if(sendError)throw sendError;return {status:'success',transactionHash:hash}},getTransaction:async()=>({from:address,to:lastTx.to,input:lastTx.data,value:0n})}),
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},window:{addEventListener(){},removeEventListener(){}},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},navigator:{locks:{request:async(_,__,fn)=>fn({})}},
};vm.runInNewContext(compiled,context);
let renderer;const drain=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));};const mount=async()=>{await act(async()=>{renderer=TestRenderer.create(React.createElement(context.exports.default,props));await drain();});};const button=label=>renderer.root.findAllByType('button').find(b=>b.children.includes(label));
await mount();await act(async()=>{const click=button('Pay securely').props.onClick;click();click();await drain();});assert.equal(signs.length,2);assert.equal(confirmCalls,1);assert.ok(signs.every(s=>s.options.address===address&&s.options.uiOptions.showWalletUIs===false));assert.equal(storage.size,0);await act(async()=>renderer.unmount());
stage='approve';signs=[];consent=false;await mount();await act(async()=>{button('Pay securely').props.onClick();await drain();});assert.equal(signs.length,0);await act(async()=>renderer.unmount());
consent=true;mismatch=true;await mount();await act(async()=>{button('Pay securely').props.onClick();await drain();});assert.equal(signs.length,0,'mismatched accepted amount must never sign');await act(async()=>renderer.unmount());mismatch=false;
consent='wait';await mount();await act(async()=>{button('Pay securely').props.onClick();await drain();});user='b';await act(async()=>{renderer.update(React.createElement(context.exports.default,props));await drain();});await act(async()=>{resolveConfirm(true);await drain();});assert.equal(signs.length,0);await act(async()=>renderer.unmount());
consent='wait';user='a';await mount();await act(async()=>{button('Pay securely').props.onClick();await drain();});user='b';await act(async()=>{renderer.update(React.createElement(context.exports.default,props));await drain();});user='a';await act(async()=>{renderer.update(React.createElement(context.exports.default,props));await drain();});await act(async()=>{resolveConfirm(true);await drain();});assert.equal(signs.length,0,'Switching away and back must invalidate old consent');await act(async()=>renderer.unmount());
consent=true;sendError=Error('Response lost');await mount();await act(async()=>{button('Pay securely').props.onClick();await drain();});assert.equal(signs.length,1);assert.equal(storage.size,1);assert.equal(button('Pay securely'),undefined);await act(async()=>{button('Check pending transaction').props.onClick();await drain();});assert.equal(signs.length,1);await act(async()=>renderer.unmount());
console.log('Hosted work checkout UI passed: first-party consent, hidden Privy transaction UI, exact amount binding, double-click protection, cancellation, account change and uncertain submission recovery.');

// The same signing/recovery implementation must render delivery semantics for Trade.
sendError=undefined;storage.clear();signs=[];stage='receipt';
props.item.terms[0].kind='trade';props.item.terms[0].trade={dispatchDays:3,deliveryDays:12,inspectionHours:48};
await mount();assert.ok(button('Confirm received'));assert.equal(button('Submit work'),undefined);
assert.match(JSON.stringify(renderer.toJSON()),/Delivery window: 12 days/);
await act(async()=>{button('Confirm received').props.onClick();await drain()});assert.equal(signs.length,1);
await act(async()=>renderer.unmount());
console.log('Hosted Trade UI passed: delivery rules, buyer receipt action and shared signing recovery.');
