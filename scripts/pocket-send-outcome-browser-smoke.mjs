import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const mocks={
 circleEvmEmailWallet:`export const readCirclePaymentFeeQuote=async()=>{};export const reconcileCircleEvmEmailWithdraw=()=>new Promise(r=>window.confirmTransfer=r)`,
 circleSolanaEmailWallet:`export const reconcileCircleSolanaTransfer=()=>new Promise(()=>{});export const sendCircleSolanaTransfer=async()=>{throw Error('unexpected Solana')}`,
 solanaPaymentFees:`export const readSolanaPaymentQuote=async()=>{};export const sendQuotedSolanaPayment=async()=>{throw Error('unexpected Solana')}`,
 pocketEvmTransferClient:`export const executePocketEvmTransfer=async(o)=>{window.confirmRequested=o.confirm;o.onChallenge({challengeId:'challenge',transactionId:'transaction'});if(window.mode==='timeout')throw Error('Connection timed out');if(window.mode==='reverted')throw Error('Withdrawal transaction reverted on-chain.');o.onAccepted({challengeId:'challenge',transactionId:'transaction'});return window.mode==='confirmed'?{txHash:'0x'+'a'.repeat(64),status:'confirmed'}:{txHash:'',status:'submitted'}}`,
 pocketEvmTransferStatusClient:`export const recoverPocketEvmTransfer=async()=>({status:'submitted'})`,
 pocketPaymentApproval:`export const registerPocketPaymentPreparer=()=>()=>{}`,
}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import useSend from './src/pocket/controllers/usePocketWithdrawalController';import {readSendAttempts,updateSendAttempt} from './src/pocket/lib/pocketSendAttempts';window.confirmTransfer=()=>{const r=readSendAttempts('fixture@test')[0];updateSendAttempt('fixture@test',r.idempotencyKey,{state:'confirmed',txHash:'0x'+'a'.repeat(64)})};const wallet={address:'0x'+'1'.repeat(40)},session={wallet:{address:wallet.address},chain:'base'};const args={owner:'fixture@test',network:'base',networkLabel:'Base',wallet,balance:10,resetKey:'fixture',ensureWallet:async()=>wallet,getEvmSession:async()=>session,getSolanaSession:async()=>null,getAccessToken:async()=> 'fixture',refreshBalances:async()=>{},clearExternalError:()=>{},onActivity:()=>{}};function App(){const send=useSend(args);window.send=send;return <p id='status'>{send.status}</p>}createRoot(document.getElementById('root')).render(<App/>);`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').at(-1);if(mocks[key])return {path:key,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{for(const mode of ['accepted','confirmed','timeout','reverted']){
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>!!window.send);
 await page.evaluate(m=>{window.mode=m;window.send.setAddress('0x'+'2'.repeat(40));window.send.setAmount('1')},mode);await page.waitForFunction(()=>window.send.amount==='1');await page.evaluate(()=>window.send.withdraw({preserveForm:true}));
 const result=await page.evaluate(()=>({status:window.send.status,journal:Object.keys(localStorage).filter(k=>k.startsWith('pocket:send-attempt:')).map(k=>JSON.parse(localStorage[k]).state)[0],confirmation:window.confirmRequested}));assert.equal(result.confirmation,true);
 assert.equal(result.status,mode==='confirmed'?'successful':mode==='reverted'?'idle':'submitted');assert.equal(result.journal,mode==='confirmed'?'confirmed':mode==='reverted'?'failed':'submitted');
 if(mode==='accepted'){await page.evaluate(()=>window.confirmTransfer({state:'confirmed',txHash:'0x'+'a'.repeat(64)}));await page.waitForFunction(()=>window.send.status==='successful');assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pocket:send-attempt:')).map(k=>JSON.parse(localStorage[k]).state)[0]),'confirmed')}
 await page.close()
}console.log('PASS: acceptance and uncertain transport remain Processing with journal; confirmation alone succeeds; explicit on-chain failure is recorded; background settlement updates the current sheet')
}finally{await browser.close()}
