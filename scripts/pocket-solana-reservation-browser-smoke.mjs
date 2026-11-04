import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Keypair,SystemProgram,Transaction} from '@solana/web3.js'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const payer=Keypair.generate(),sponsor=Keypair.generate()
const transaction=new Transaction({feePayer:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:sponsor.publicKey,lamports:1}))
transaction.sign(payer,sponsor)
const signed=transaction.serialize().toString('base64')
const mocks={
 circleSolanaEmailWallet:`export async function signCircleSolanaTransaction(input){window.signs++;if(!input.bridge.idempotencyKey||input.bridge.reservationVersion!==1)throw Error('Missing reservation');if(window.mode==='cancel')throw Error('User cancelled approval');return window.signed}`,
 circleEvmEmailWallet:`export const bridgeCircleEvmEmailWallet=async()=>{throw Error('Unexpected EVM dispatch')};export const readCircleEvmBridgeReservation=async()=>({managed:false});export const recoverCircleEvmBridgeChallenge=async()=>null;export const readCircleEvmBridgeChallenge=async()=>({});export const reconcileCircleEvmEmailWithdraw=async()=>({})`,
 pocketBridgeClient:`export const readPocketBridgeQuote=async p=>({source:p.source,destination:p.destination,amount:p.amount,receive:p.amount,fee:'0.01',total:String(Number(p.amount)+.01),expiresAt:Date.now()+60000,quoteToken:'fixture'});export const recordPocketBridge=async()=>{};export const readPendingPocketBridges=async()=>[];export const readPocketBridgeStatus=async()=>({status:'pending',sourceConfirmed:false})`,
 usePocketWalletController:`export const activePocketEvmSession=()=>null`,
 pocketPaymentApproval:`export const registerPocketPaymentPreparer=()=>()=>{}`,
}
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import {movePocketSolanaFunding} from './src/pocket/lib/pocketSolanaFunding';import useBridge from './src/pocket/controllers/usePocketBridgeController';import useActivity from './src/pocket/hooks/usePocketBridgeActivity';import{readPocketBridgeTransfers}from'./src/pocket/lib/pocketPendingBridge';
window.records=owner=>readPocketBridgeTransfers(owner,localStorage);window.signs=0;window.prepares=0;window.submits=0;window.mode='prepareLost';window.server={managed:true,status:'started',reservationReleased:false};
window.fetch=async(url,options)=>{const body=JSON.parse(options.body);if(body.action==='recover'){if(window.gate)await window.gate;return Response.json({ok:true,...window.server})}const record=window.records('owner').find(r=>r.id===body.idempotencyKey);if(!record||body.reservationVersion!==1)throw Error('Attempt missing before request');if(!body.transaction){window.prepares++;if(window.mode==='prepareLost')throw Error('Lost prepare');return Response.json({ok:true,...window.server,transaction:window.signed,lastValidBlockHeight:123})}window.submits++;if(!record.txHash||!record.managedReservation)throw Error('Missing durable signature');window.server={managed:true,status:'submitted',txHash:record.txHash,reservationReleased:false};throw Error('Lost submit')};
const wallets={solana:{address:'${payer.publicKey.toBase58()}',walletId:'solana',blockchain:'SOL'},base:{address:'0x'+'1'.repeat(40),walletId:'base',blockchain:'BASE'}};window.checkout=()=>movePocketSolanaFunding({owner:'owner',fundingKey:'checkout:fixture',session:{wallet:{id:'solana',address:wallets.solana.address}},destination:'base',destinationAddress:wallets.base.address,amount:'1',quoteToken:'fixture',accessToken:'fixture'});const rows=[];const access=async()=> 'fixture';
function App(){const[owner,setOwner]=useState('owner');window.setOwner=setOwner;const bridge=useBridge({owner,source:'solana',sourceBalance:10,sourceBalanceKnown:true,wallets,ensureWallet:async n=>wallets[n],getSolanaSession:async()=>({wallet:{id:'solana',address:wallets.solana.address}}),getEvmSession:async()=>{throw Error('Unexpected EVM session')},getAccessToken:access,refresh:async()=>{},onActivity:()=>{}});const activity=useActivity({owner,authenticated:true,rows,getAccessToken:access,getEvmSession:async()=>{throw Error('Unexpected EVM session')}});window.bridge=bridge;window.activity=activity;return <><input aria-label='Amount' value={bridge.amount} onChange={e=>bridge.setAmount(e.target.value)}/><button onClick={()=>bridge.bridge()}>Confirm</button><output>{bridge.notice||bridge.error}</output></>};const root=createRoot(document.getElementById('root'));let version=0;window.remount=()=>root.render(<App key={++version}/>);window.remount();`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',define:{'import.meta.env':'{}'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>{const name=a.path.split('/').pop();if(mocks[name])return {path:name,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid/');await page.evaluate(value=>window.signed=value,signed);await page.addScriptTag({content:bundle.outputFiles[0].text})
 const confirm=async()=>{await page.getByLabel('Amount').fill('1');await page.waitForFunction(()=>window.bridge?.quote?.amount==='1');await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForFunction(()=>!window.bridge.submitting)}
 await confirm();assert.equal(await page.evaluate(()=>window.prepares),1);assert.equal(await page.evaluate(()=>window.signs),0)
 await page.evaluate(()=>window.remount());await confirm();assert.equal(await page.evaluate(()=>window.prepares),1,'Unknown prepare cannot be redispatched after remount')
 await page.evaluate(async()=>{await window.activity.check(window.records('owner')[0])});assert.equal(await page.evaluate(()=>window.records('owner')[0].managedReservation),true)
 await page.evaluate(()=>{localStorage.clear();window.mode='cancel';window.remount()});await confirm();assert.equal(await page.evaluate(()=>window.submits),0)
 assert.notEqual(await page.evaluate(()=>window.records('owner')[0].progress),'failed','Closing approval is not proof of source failure')
 const signs=await page.evaluate(()=>window.signs);await page.evaluate(()=>window.remount());await confirm();assert.equal(await page.evaluate(()=>window.signs),signs)
 await page.evaluate(()=>{localStorage.clear();window.mode='submitLost';window.remount()});await confirm()
 const saved=await page.evaluate(()=>window.records('owner')[0]);assert(saved.txHash);assert.equal(saved.managedReservation,true);assert.equal(await page.evaluate(()=>window.submits),1)
 await page.evaluate(async()=>{await window.activity.check(window.records('owner')[0])});assert.equal(await page.evaluate(()=>window.submits),1)
 await page.evaluate(()=>{window.gate=new Promise(resolve=>window.release=resolve);window.checking=window.activity.check(window.records('owner')[0])})
 await page.evaluate(()=>window.setOwner('other'));await page.waitForFunction(()=>window.bridge.amount==='')
 await page.evaluate(async()=>{window.release();await window.checking;window.gate=null})
 assert.equal(await page.evaluate(()=>window.records('other').length),0)
 await page.evaluate(()=>{localStorage.clear();window.server={managed:true,status:'started',reservationReleased:false};window.mode='submitLost'})
 const priorSubmits=await page.evaluate(()=>window.submits)
 const message=await page.evaluate(()=>window.checkout().then(()=>'',e=>e.message));assert.match(message,/saved/)
 const checkoutRecord=await page.evaluate(()=>window.records('owner')[0]);assert.equal(checkoutRecord.fundingKey,'checkout:fixture')
 assert.equal(await page.evaluate(()=>window.checkout()),checkoutRecord.txHash)
 assert.equal(await page.evaluate(()=>window.submits),priorSubmits+1,'Checkout adapter recovers without a second submit')
 assert.deepEqual(errors,[])
 console.log('PASS Chrome manual Solana bridge: persist before prepare, unknown prepare remount, cancelled approval retained, signed reference before submit, lost-submit recovery without redispatch and account-switch isolation. Provider/signing fixtures only.')
}finally{await browser.close()}
