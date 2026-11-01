import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const mocks={
 '../api/pocketReadClient':`export const readPocketBalances=input=>window.balanceReader(input);export const readPocketLinkedWallets=async()=>({base:window.wallet});`,
 './usePocketIdentity':`const token=async()=>'fixture';export default ()=>({authenticated:true,user:{id:'fixture',linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',address:window.wallet.address}]},getAccessToken:token})`,
 '../api/pocketStockBalanceClient':`export async function readRemoteStockBalances(){window.counts.xlayer++;return {holdings:[],cash:0n,gas:0n,complete:true,observedAt:Date.now()}}`,
 '../api/pocketFxClient':`export const parsePocketFxQuote=v=>v.quote;export async function readPocketFxQuote(amount,fetcher,currency,asset){window.counts.fx++;return {amount,currency,asset,rate:1300,quotedAt:Date.now(),expiresAt:Date.now()+30000,stale:false}}`,
}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import useWallets from './src/pocket/hooks/usePocketWallets';import useBsc from './src/pocket/hooks/usePocketBscBalances';import useStock from './src/pocket/hooks/usePocketStockBalances';import useFx from './src/pocket/hooks/usePocketFxQuote';import{refreshPocketData}from'./src/pocket/lib/pocketRefresh';import{pocketBalanceRevision}from'./src/pocket/lib/pocketBalanceRevision';
window.counts={circle:0,bsc:0,xlayer:0,fx:0};window.wallet={address:'0x'+'1'.repeat(40),walletId:'fixture',updatedAt:1};window.amount=7;window.fail=false;
window.balanceReader=async()=>{window.counts.circle++;if(window.fail)throw Error('Fixture unavailable');const rows=await Promise.all(['base','arbitrum','arc','solana','ethereum','polygon'].map(async key=>({key,label:key,balance:key==='base'?window.amount:0,status:'ok',walletRevision:await pocketBalanceRevision(key,key==='base'?window.wallet:undefined),observedAt:Date.now()})));return {rows,total:window.amount,totalComplete:true,unavailableNetworks:[]}};
window.fetch=async()=>{window.counts.bsc++;return {ok:true,json:async()=>({ok:true,network:'bsc',address:window.wallet.address,rows:['BNB','USDC','USDT'].map(symbol=>({symbol,quantity:0,valueUsd:0})),observedAt:Date.now()})}};
const token=async()=>'fixture';function App(){const c=useWallets({authenticated:true,email:'fixture@local.invalid',getAccessToken:token}),b=useBsc(),x=useStock('fixture',window.wallet.address,token),fx=useFx(1,true,'NGN',true);return <pre id='state'>{JSON.stringify({circle:c.displayTotal,complete:c.totalComplete,busy:c.balanceBusy,bsc:b.complete,xlayer:!!x.displaySnapshot,fx:!!fx.quote})}</pre>}window.refresh=refreshPocketData;window.mount=()=>createRoot(document.getElementById('root')).render(<App/>);`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install()
 await p.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await p.goto('https://fixture.invalid');await p.addScriptTag({content:bundle.outputFiles[0].text});await p.evaluate(()=>window.mount())
 const state=()=>p.locator('#state').textContent().then(JSON.parse)
 await p.waitForFunction(()=>{const s=JSON.parse(document.getElementById('state').textContent);return s.complete&&s.bsc&&s.xlayer&&s.fx&&!s.busy})
 assert.deepEqual(await p.evaluate(()=>window.counts),{circle:1,bsc:1,xlayer:1,fx:1})
 await p.clock.fastForward(120000);assert.deepEqual(await p.evaluate(()=>window.counts),{circle:1,bsc:1,xlayer:1,fx:1},'No idle provider reads across Circle networks, BNB, X Layer or display FX')
 await p.evaluate(async()=>{window.amount=9;await window.refresh()});assert.equal((await state()).circle,9)
 assert.deepEqual(await p.evaluate(()=>window.counts),{circle:2,bsc:2,xlayer:2,fx:2},'One registered event/manual refresh updates each scope')
 await p.evaluate(async()=>{window.fail=true;await window.refresh().catch(()=>{})});assert.equal((await state()).circle,9,'Provider failure retains last known balance');assert.equal((await state()).complete,false)
 assert.deepEqual(errors,[])
 console.log('PASS real Chrome: all balance scopes and display FX stay idle; incoming-event/manual refresh updates each once; provider failure retains saved value without claiming freshness.')
}finally{await browser.close()}
