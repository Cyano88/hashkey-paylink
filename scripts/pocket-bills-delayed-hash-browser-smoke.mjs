import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const category=process.env.BILL_CATEGORY||'airtime'
const stubs={pocketActivityCache:'export const markPocketActivityDirty=()=>{};',pocketBillsClient:`const available={enabled:true,environment:'live',airtimeEnabled:true};export const processPocketBillRefund=async()=>{throw Error('Refund not expected in this fixture')};export class PocketBillsApiError extends Error{};export const cachedPocketBillsAvailability=()=>available;export const readPocketBillsAvailability=async()=>available;const intent=()=>({id:'bill-fixture',state:'quoted',quoteExpiresAt:Date.now()+60000,treasuryAddress:'0x'+'2'.repeat(40),amountUsdc:'1'});export const quotePocketAirtime=async()=>({intent:intent()});export const quotePocketData=quotePocketAirtime,quotePocketTv=quotePocketAirtime,quotePocketElectricity=quotePocketAirtime;export const preparePocketAirtime=async()=>intent();export const confirmPocketAirtime=async(input)=>{window.confirmedHash=input.txHash;return {...intent(),state:'delivered'}};export const refreshPocketAirtime=async()=>({...intent(),state:window.confirmedHash?'delivered':'awaiting_payment'});export const readPocketDataCatalog=async()=>({services:[],variations:[]});export const verifyPocketBillCustomer=async()=>({});`,pocketEvmTransferClient:`export const executePocketEvmTransfer=async(input)=>{window.sends++;input.onAccepted({challengeId:'challenge-fixture',transactionId:'tx-fixture'});return {txHash:null,status:'submitted'}}`,pocketPaymentApproval:'export const registerPocketPaymentPreparer=()=>()=>{};',pocketRefresh:'export const registerPocketRefreshHandler=()=>()=>{};'}
const bundle=await build({stdin:{contents:`import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import useBills from './src/pocket/controllers/usePocketBillsController';const wallet={address:'0x'+'1'.repeat(40)};const token=async()=> 'fixture',refresh=async()=>{},session=()=>new Promise(r=>window.release=()=>r({wallet}));window.sends=0;function App(){const[,tick]=useState(0);useEffect(()=>{const t=setInterval(()=>tick(n=>n+1),500);return()=>clearInterval(t)},[]);const[owner,setOwner]=useState('alice');window.owner=setOwner;const bills=useBills({owner,view:'${category}',authenticated:true,baseWallet:wallet,recoverTransfer:async()=>window.delivered?'0x'+'3'.repeat(64):null,getAccessToken:()=>token(),ensureBaseWallet:async()=>wallet,getEvmSession:session,refreshBalances:()=>refresh()});window.bills=bills;return <output>{owner}:{bills.status}</output>}createRoot(document.getElementById('app')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'stubs',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();if(stubs[key])return{path:key,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage()
 await page.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<div id="app"></div>'}))
 await page.goto('https://fixture.invalid/')
 await page.clock.install()
 await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.waitForFunction(()=>!!window.bills)
 await page.evaluate(()=>window.bills.review())
 await page.waitForFunction(()=>window.bills.status==='ready')
 await page.evaluate(()=>{window.bills.pay()})
 await page.waitForFunction(()=>!!window.release)
 await page.evaluate(()=>window.release())
 await page.waitForFunction(()=>window.bills.status==='processing')
 // Another recovery reader/tab may consume the retry journal first.
 await page.evaluate(()=>{window.delivered=true})
 await page.clock.runFor(35_000)
 await page.waitForFunction(()=>window.bills.status==='successful',{},{timeout:2000})
 assert.equal(await page.evaluate(()=>window.bills.intent.state),'delivered')
 assert.equal(await page.evaluate(()=>window.sends),1)
 assert.equal(await page.evaluate(()=>window.confirmedHash),'0x'+'3'.repeat(64))
 console.log('PASS: recorded Circle challenge recovers its hash and confirms original bill; no second send.')
} finally {await browser.close()}

