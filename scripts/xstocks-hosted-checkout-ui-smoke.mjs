import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(process.env.CHECKOUT_UI_TEST_MODULE_ROOT || import.meta.url);
const React=require('react'),TestRenderer=require('react-test-renderer'),{act}=TestRenderer;
const output=new URL('../.codex-temp/hosted-ui-test.mjs',import.meta.url);
const address='0x'+'11'.repeat(20);
globalThis.__checkout={wallet:{address},confirm:async()=>false};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k),setItem:(k,v)=>storage.set(k,v)};
await build({entryPoints:['src/components/xstocksAgreement/HostedWorkCheckout.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:output.pathname.replace(/^\/([A-Za-z]:)/,'$1'),plugins:[{name:'wallet-fixtures',setup(b){b.onResolve({filter:/^react(\/jsx-runtime)?$/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));b.onResolve({filter:/(@privy-io\/react-auth|\/hostedWallet|\.\/ConfirmSheet)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('react-auth')?`export const usePrivy=()=>({authenticated:true,user:{id:'fixture'}}),useWallets=()=>({wallets:[]}),useSendTransaction=()=>({sendTransaction:()=>{throw Error('Unexpected signing')}});`:a.path.includes('hostedWallet')?`export const selectHostedWallet=()=>globalThis.__checkout.wallet;`:`export const useStreamConfirm=()=>({confirm:(...a)=>globalThis.__checkout.confirm(...a),confirmation:null});` }));}}]});
try{
 const {default:Checkout}=await import(output.href);
 let fail=false,state=1,resolveConfirmation;
 const request=async()=>{if(fail)throw Error('upstream HTML');return {enabled:true,state,actions:state===1?['approve','cancel']:[],wallet:{address},customerReady:true,providerReady:true}};
 const item={id:'fixture',activeVersion:1,role:'customer',terms:[{kind:'trade',version:1,amount:'0.00222',durationSeconds:86400,xlayerPayment:{token:'0xc845b2894dbddd03858fd2d643b4ef725fe0849d',decimals:18,amountUnits:'2220000000000000',reviewHours:48}}]};
 let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(Checkout,{item,request,onUpdated(){}}))});
 const buttons=()=>tree.root.findAllByType('button');const find=t=>buttons().find(b=>b.children.join('')===t);const text=()=>JSON.stringify(tree.toJSON());
 assert.ok(find('Pay into escrow'));assert.equal(find('Approve payment'),undefined);
 fail=true;await act(async()=>{await find('Refresh agreement').props.onClick()});
 assert.equal(find('Pay into escrow'),undefined);assert.equal(find('Cancel unpaid escrow'),undefined);assert.match(text(),/Payment status unavailable/);
 fail=false;await act(async()=>{await find('Refresh agreement').props.onClick()});assert.ok(find('Pay into escrow'));assert.doesNotMatch(text(),/Payment status unavailable/);
 globalThis.__checkout.confirm=()=>new Promise(r=>resolveConfirmation=r);
 await act(async()=>{find('Pay into escrow').props.onClick()});assert.equal(find('Pay into escrow'),undefined);assert.equal(find('Cancel unpaid escrow'),undefined);
 await act(async()=>{resolveConfirmation(false)});assert.ok(find('Pay into escrow'));
 state=2;await act(async()=>{await find('Refresh agreement').props.onClick()});assert.match(text(),/Payment held in escrow/);assert.equal(find('Pay into escrow'),undefined);assert.equal(find('Cancel unpaid escrow'),undefined);
 await act(async()=>tree.unmount());console.log('Hosted checkout UI passed: stale status blocks actions, refresh recovers, processing hides CTAs, funded state removes unpaid actions.');
}finally{await unlink(output)}
