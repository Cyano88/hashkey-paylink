import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React from 'react';import{createRoot}from'react-dom/client';import useRecovery from './src/pocket/hooks/usePocketOperationRecovery';import{trackPocketOperation}from './src/pocket/lib/pocketOperationRecovery';window.calls=[];window.restores=[];window.refreshes=0;trackPocketOperation('owner','bridge',{quoteToken:'sealed',quote:{id:'pending',source:'arbitrum',destination:'base',walletAddress:'wallet',amount:'2'}});window.fetch=async(url,options)=>{const body=JSON.parse(options.body);window.calls.push(body);if(window.unreachable)throw Error('offline');return new Response(JSON.stringify({ok:true,status:'failed'}))};function App(){useRecovery({authenticated:true,email:'owner',getAccessToken:async()=>'app-session'});return <div>Recovery mounted</div>}createRoot(document.getElementById('root')).render(<App/>);`
const mocks={usePocketWalletController:`export const connectFreshEvmSession=async(owner,network,address)=>{window.restores.push({owner,network,address});return{userToken:'retained-circle-session'}}`,usePocketActivity:`export const prefetchPocketActivity=async()=>{window.refreshes++}`}
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();return mocks[key]?{path:key,namespace:'mock'}:undefined});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage();await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.test');await page.addScriptTag({content:result.outputFiles[0].text});
 await page.waitForFunction(()=>window.refreshes===1)
 assert.equal(await page.evaluate(()=>window.calls.length),1)
 assert.equal(await page.evaluate(()=>window.calls[0].action),'status')
 assert.equal(await page.evaluate(()=>window.calls[0].circleUserToken),'retained-circle-session')
 assert.equal(await page.evaluate(()=>window.restores[0].address),'wallet')
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket:operation:v1:owner:bridge:pending')).state),'failed')
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(250)
 assert.equal(await page.evaluate(()=>window.calls.length),1,'Terminal records are not polled or resubmitted')
 await page.goto('https://fixture.test');await page.evaluate(()=>{localStorage.clear();window.unreachable=true});await page.addScriptTag({content:result.outputFiles[0].text});await page.waitForFunction(()=>window.calls.length===1);await page.waitForTimeout(100)
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket:operation:v1:owner:bridge:pending')).state),'processing','Connectivity failure is not a payment failure')
 console.log('PASS background recovery: retained session, status-only calls, terminal result and offline preservation')
}finally{await browser.close()}
