import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {unlink} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256} from 'viem';
const require=createRequire(process.env.CHECKOUT_UI_TEST_MODULE_ROOT||import.meta.url);
const React=require('react'),{act,create}=require('react-test-renderer');
const output=new URL('../.codex-temp/recovery-ui.mjs',import.meta.url);
const account=privateKeyToAccount('0x'+'11'.repeat(32)),to='0x'+'22'.repeat(20),data='0x7d94ad98';
const raw=await account.signTransaction({chainId:196,to,data,value:0n,nonce:4,gas:50000n,gasPrice:1000000000n});
const hash=keccak256(raw),storage=new Map();let signingFails=true,available=false,signCalls=0,broadcasts=[],otherTab=false,recoveryStatus;
globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.visibilityState='visible';
Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(_k,_o,cb)=>cb(otherTab?null:{})}},configurable:true});
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.__recovery={wallet:{address:account.address,switchChain:async()=>{}},sign:async(input)=>{assert.equal(input.gasLimit,50000n);assert.equal(input.gasPrice,1000000000n);assert.equal(input.nonce,4);signCalls++;if(signingFails)throw Error('Preparation unavailable');return {signature:raw}},rpc:{
 estimateGas:async()=>41666n,getGasPrice:async()=>1000000000n,getTransactionCount:async()=>4,
 sendRawTransaction:async({serializedTransaction})=>{assert.ok([...storage.values()].some(v=>JSON.parse(v).hash===hash),'persist before broadcast');broadcasts.push(serializedTransaction);throw Error('Lost response')},
 waitForTransactionReceipt:async()=>{if(!available)throw Error('Receipt timeout');return {transactionHash:hash,status:'success'}},
 getTransaction:async()=>{if(!available){const e=Error('not found');e.name='TransactionNotFoundError';throw e;}return {from:account.address,to,input:data,value:0n}},getChainId:async()=>196
}};
await build({entryPoints:['src/components/xstocksAgreement/HostedWorkCheckout.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:fileURLToPath(output),plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^file:/},a=>({path:a.path,external:true}));
 b.onResolve({filter:/^react(\/jsx-runtime)?$/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));
 b.onResolve({filter:/^(viem|@privy-io\/react-auth)$|\/hostedWallet$|\.\/ConfirmSheet$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='viem'?'export * from '+JSON.stringify(new URL('../node_modules/viem/_esm/index.js',import.meta.url).href)+';export const createPublicClient=()=>globalThis.__recovery.rpc;':a.path.includes('react-auth')?"export const usePrivy=()=>({authenticated:true,user:{id:'test'}}),useWallets=()=>({wallets:[]}),useSignTransaction=()=>({signTransaction:globalThis.__recovery.sign});":a.path.includes('hostedWallet')?'export const selectHostedWallet=()=>globalThis.__recovery.wallet;':'export const useStreamConfirm=()=>({confirm:async()=>true,confirmation:null});'}));
}}]});
try{
 const {default:Checkout}=await import(output.href);
 const item={id:'recovery',activeVersion:1,role:'customer',terms:[{version:1,kind:'trade',amount:'1',xlayerPayment:{token:to,amountUnits:'1',decimals:18,reviewHours:48}}]};
 const request=async()=>recoveryStatus??({enabled:true,state:3,actions:['receipt'],wallet:{address:account.address},customerReady:true,providerReady:true,token:to,amount:'1',decimals:18,transaction:{account:account.address,to,data,chainId:196,value:'0'}});
 let tree;const mount=async()=>act(async()=>{tree=create(React.createElement(Checkout,{item,request,onUpdated(){}}))});
 const button=name=>tree.root.findAllByType('button').find(b=>b.children.join('')===name);
 await mount();
 await act(async()=>{await button('Confirm received').props.onClick()});assert.equal(storage.size,0);assert.equal(broadcasts.length,0);
 signingFails=false;await act(async()=>{await button('Confirm received').props.onClick()});assert.equal(storage.size,1);assert.equal(broadcasts.length,1);assert.ok(button('Check pending transaction'));const pendingKey=[...storage.keys()][0];
 await act(async()=>tree.unmount());await mount();
 otherTab=true;await act(async()=>{await button('Check pending transaction').props.onClick()});assert.equal(broadcasts.length,1);otherTab=false;
 await act(async()=>{await button('Check pending transaction').props.onClick()});assert.equal(broadcasts.length,2);assert.equal(broadcasts[0],broadcasts[1]);assert.equal(signCalls,2);assert.equal(storage.size,1);
 available=true;await act(async()=>{await button('Check pending transaction').props.onClick()});assert.equal(storage.size,0);assert.equal(broadcasts.length,2);
 await act(async()=>tree.unmount());
 const invalid=await account.signTransaction({chainId:196,to,data,value:0n,nonce:4,gas:0n,gasPrice:1000000000n});
 storage.set(pendingKey,JSON.stringify({transaction:{account:account.address,to,data,chainId:196,value:'0'},serialized:invalid,hash:keccak256(invalid),operation:'receipt'}));
 await mount();await act(async()=>{await button('Check pending transaction').props.onClick()});
 assert.equal(storage.size,0,'provably invalid zero-gas transaction is safely retired');
 assert.equal(broadcasts.length,2,'invalid recovery does not send');
 assert.ok(button('Confirm received'),'action becomes available again');
 await act(async()=>tree.unmount());
 available=false;
 const reviewed={nonce:'3',buyerAmount:'0',evidence:'0x'+'bb'.repeat(32)};
 const saved={transaction:{account:account.address,to,data,chainId:196,value:'0'},serialized:raw,hash,operation:'acceptSettlement',settlement:reviewed};
 recoveryStatus={enabled:true,state:5,observedBlock:'102',pending:true,actions:[],settlement:{...reviewed,nonce:'4',proposer:to},wallet:{address:account.address},customerReady:true,providerReady:true};
 storage.set(pendingKey,JSON.stringify(saved));await mount();await act(async()=>{await button('Check pending transaction').props.onClick()});assert.ok(storage.has(pendingKey),'Pending proposal observation cannot retire saved action');assert.equal(broadcasts.length,2);
 recoveryStatus={...recoveryStatus,pending:false};await act(async()=>{await button('Check pending transaction').props.onClick()});assert.equal(storage.has(pendingKey),false);assert.ok(storage.has(pendingKey+':obsolete'));assert.equal(broadcasts.length,2,'Obsolete acceptance is never rebroadcast');assert.equal(button('Check pending transaction'),undefined);
 await act(async()=>tree.unmount());console.log('Recovery UI passed: failed signing, persist before broadcast, lost response, reload, other-tab exclusion, exact-byte resume and confirmed cleanup.');
}finally{await unlink(output)}
