import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Panel from './src/pocket/components/PocketUsdtBridgePanel';
window.requests=[];window.approvals=[];window.mode='awaiting_approval';
const pending={quoteToken:'saved-quote',challengeId:'saved-challenge',quote:{id:'saved',source:'arbitrum',destination:'base',walletAddress:'0x'+'1'.repeat(40),amount:'1',receive:'.99',fee:'.05',total:'1.05',expiresAt:1}};
localStorage.setItem('pocket:usdt-bridge:v1:approval-fixture',JSON.stringify(pending));
window.fetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;if(!body)return new Response(JSON.stringify({ok:false,error:'Temporary recovery failure'}),{status:403});window.requests.push(body);if(!['status','resume'].includes(body.action))throw Error('Duplicate transaction requested');return new Response(JSON.stringify({ok:true,status:body.circleUserToken?window.mode:'pending',challengeId:'saved-challenge'}))};
createRoot(document.getElementById('root')).render(<MemoryRouter><Panel owner='approval-fixture' getAccessToken={async()=> 'fixture'} ensureWallet={async()=>null} getSession={async()=>({userToken:'circle-fixture',chain:'arbitrum'})} balances={[{key:'arbitrum',usdt:8}]} refresh={async()=>{}} onActivity={()=>{}} onBusyChange={()=>{}}/></MemoryRouter>);`
const mocks={usePocketIdentity:`export default()=>({authenticated:true,email:'fixture@test',getAccessToken:async()=>null})`,usePocketWallets:`export default()=>({resolved:true,wallets:{},setWallets:()=>{}})`,usePocketWalletController:`export default()=>({ensureWallet:async()=>null})`,PocketNetworkBalance:`export default()=>null`,PocketRouteShell:`export default({children})=>children`,circleEvmEmailWallet:`export const executeCircleEvmEmailChallenge=async(params)=>{window.approvals.push(params);return {transactionHash:null}}`}
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();return mocks[key]?{path:key,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage();await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.test');await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByRole('button',{name:'Continue bridge',exact:true}).click()
 await page.waitForFunction(()=>window.approvals.length===1)
 const approved=await page.evaluate(()=>window.approvals[0]);assert.equal(approved.challengeId,'saved-challenge');assert.equal(approved.approval.asset,'USDT');assert.equal(approved.approval.totalAmount,'1.05');assert.equal(approved.session.chain,'arbitrum')
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 await page.evaluate(()=>window.mode='pending');await page.getByRole('button',{name:'Confirm bridge',exact:true}).click()
 await page.getByRole('button',{name:'Continue bridge',exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>window.approvals.length),1,'provider pending must not reopen approval')
 assert.equal(await page.evaluate(()=>window.requests.some(r=>r.action==='execute'||r.action==='quote')),false)
 await page.evaluate(()=>window.mode='completed');await page.getByRole('button',{name:'Continue bridge',exact:true}).click()
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Enter bridge amount',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Try again',exact:true}).count(),0,'successful recovery must clear earlier list failure')
 console.log('PASS refresh recovery reopens same challenge with USDT details; submitted/unknown state never reapproves or creates a transfer')
}finally{await browser.close()}
