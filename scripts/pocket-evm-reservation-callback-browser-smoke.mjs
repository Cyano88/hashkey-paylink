import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const mocks={
 circleEvmEmailWallet:`export const bridgeCircleEvmEmailWallet=async p=>{window.calls++;p.onBeforeChallenge();if(window.mode!=='legacy')p.onReservation({managed:true,status:'awaiting_approval',challengeId:'challenge',reservationReleased:false});p.onChallenge('challenge');window.atApproval=window.records()[0];if(window.mode==='lost')throw Error('Approval response lost');return '0x'+'a'.repeat(64)};export const readCircleEvmBridgeReservation=async()=>({managed:true,status:'awaiting_approval',challengeId:'challenge',reservationReleased:false});export const readCircleEvmBridgeChallenge=async()=>({awaitingApproval:true})`,
 pocketBridgeClient:`export const readPocketBridgeQuote=async p=>({...p,receive:p.amount,fee:'0.01',total:String(Number(p.amount)+.01),expiresAt:Date.now()+60000,quoteToken:'fixture'});export const recordPocketBridge=async()=>{}`,
 pocketSolanaBridge:`export const bridgeCircleSolanaWallet=async()=>{throw Error('Unexpected Solana signing')}`,
 pocketPaymentApproval:`export const registerPocketPaymentPreparer=()=>()=>{}`,
}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import useBridge from './src/pocket/controllers/usePocketBridgeController';import{readPocketBridgeTransfers}from'./src/pocket/lib/pocketPendingBridge';window.records=()=>readPocketBridgeTransfers('owner',localStorage);window.calls=0;const wallets={base:{address:'0x'+'1'.repeat(40)},arbitrum:{address:'0x'+'2'.repeat(40)}};function App(){const b=useBridge({owner:'owner',source:'base',fixedDestination:'arbitrum',sourceBalance:10,sourceBalanceKnown:true,wallets,ensureWallet:async n=>wallets[n],getEvmSession:async()=>({chain:'base',wallet:{id:'fixture',address:wallets.base.address}}),getSolanaSession:async()=>{throw Error('Unexpected session')},getAccessToken:async()=> 'fixture',refresh:async()=>{},onActivity:()=>{}});window.bridge=b;return <><input aria-label='Amount' value={b.amount} onChange={e=>b.setAmount(e.target.value)}/><button onClick={()=>b.bridge()}>Confirm</button></>};createRoot(document.getElementById('root')).render(<App/>);`
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env':'{}'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();if(mocks[key])return{path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const mode of ['managed','lost','legacy']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid/');await page.evaluate(mode=>window.mode=mode,mode);await page.addScriptTag({content:bundle.outputFiles[0].text})
  await page.getByLabel('Amount').fill('1');await page.waitForFunction(()=>window.bridge.quote?.amount==='1');await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForFunction(()=>!window.bridge.submitting&&window.calls===1)
  const state=await page.evaluate(()=>({approval:window.atApproval,saved:window.records()[0]}))
  assert.equal(!!state.approval.managedReservation,mode!=='legacy','Persist managed flag before approval returns')
  assert.equal(!!state.saved.managedReservation,mode!=='legacy')
  if(mode!=='legacy')assert.equal(state.saved.reservationReleased,false)
  if(mode==='lost'){assert.notEqual(state.saved.progress,'failed');assert.equal(state.saved.txHash,undefined)}
  else assert.equal(state.saved.txHash,'0x'+'a'.repeat(64))
  assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS EVM bridge saves managed reservation before approval; lost approval retains pending reservation; legacy response stays compatible. Mocked provider, no funds moved.')
}finally{await browser.close()}
