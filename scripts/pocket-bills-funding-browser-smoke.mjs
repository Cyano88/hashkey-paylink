import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const stubs={
 circleEvmEmailWallet:`export async function bridgeCircleEvmEmailWallet(input){window.bridge=input;return '0x'+'3'.repeat(64)}`,
 pocketSolanaBridge:`export async function bridgeCircleSolanaWallet(){throw Error('Unexpected Solana bridge')}`,
 pocketReadClient:`export async function readPocketDestinationLiquidity(){return {balance:0.11,wallet:window.wallets.base}};export async function readPocketBankRoutingLiquidity(){return {wallets:window.wallets,rows:[{key:'base',balance:0.11,status:'ok'},{key:'ethereum',balance:100,status:'ok'},{key:'polygon',balance:window.onlyEthereum?0:2,status:'ok'}]}};export async function readPocketBalances(){throw Error('Unrestricted scan used')};export async function readPocketLinkedWallets(){throw Error('Unrestricted scan used')}`,
 pocketBridgeClient:`export async function readPocketBridgeQuote(input){window.quotes.push(input);return {total:input.amount}};export async function readPocketBridgeStatus(){return {status:'complete'}};export async function recordPocketBridge(){}`,
}
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import useLiquidity from './src/pocket/controllers/usePocketPaymentLiquidityController';window.wallets=Object.fromEntries(['base','ethereum','polygon'].map((n,i)=>[n,{address:'0x'+String(i+1).repeat(40),walletId:n,blockchain:n}]));window.quotes=[];const input={enabled:true,bankPayout:true,amount:'0.146863',destination:'base',getAccessToken:async()=>'fixture-access',ensureWallet:async n=>window.wallets[n],getEvmSession:async(chain)=>({chain}),getSolanaSession:async()=>{throw Error('Unexpected Solana')},refreshBalances:async()=>{}};function App(){window.liquidity=useLiquidity(input);return null}const root=createRoot(document.getElementById('root'));window.start=only=>{window.onlyEthereum=only;root.render(<App key={String(only)}/>)};`
const bundle=await build({stdin:{contents,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();if(stubs[key])return{path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path]}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const p=await browser.newPage();await p.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await p.goto('https://fixture.invalid/');await p.addScriptTag({content:bundle.outputFiles[0].text});await p.evaluate(()=>window.start(false));await p.waitForFunction(()=>window.liquidity?.route?.kind==='bridge');
 assert.equal(await p.evaluate(()=>window.liquidity.route.source),'polygon');
 await p.evaluate(()=>window.liquidity.ensureLiquidity());
 assert.deepEqual(await p.evaluate(()=>[window.bridge.session.chain,window.bridge.privyAccessToken,window.bridge.amount,window.liquidity.status]),['polygon','fixture-access','0.036863','arrived']);
 assert(await p.evaluate(()=>window.quotes.every(q=>q.source!=='ethereum')));
 await p.evaluate(()=>window.start(true));await p.waitForFunction(()=>window.liquidity?.route?.kind==='insufficient');
 assert(await p.evaluate(()=>window.quotes.every(q=>q.source!=='ethereum')));
 console.log('PASS Bills funding excludes Ethereum, selects Polygon for the full debit shortfall, passes bridge authentication, and reports insufficient when only Ethereum is funded. No real payments.');
}finally{await browser.close()}
