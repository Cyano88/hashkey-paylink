import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const mocks={
 './PocketWalletPreparation':`export default ()=>null`,
 '../hooks/usePocketFxQuote':`export default ()=>({})`,
 '../controllers/usePocketWalletController':`export const reconnectPocketBaseWallet=async()=>{}`,
 '../api/pocketBillsClient':`export const readPocketBillsLimitUsage=()=>window.readBills()`,
 '../api/pocketSpendingLimitsClient':`export const readPocketBankPayoutLimit=async()=>({maxUsdc:1,ngnEquivalent:1,asOf:Date.now()})`,
}
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Page from './src/pocket/components/PocketProfileFeaturePage';window.calls=0;window.fail=true;window.readBills=async()=>{window.calls++;if(window.fail)throw Error('outage');return {resetAt:Date.now()+100000,airtime:{perPaymentNgn:50000,dailyLimitNgn:200000,usedTodayNgn:100,remainingTodayNgn:199900},otherBills:{dailyLimitNgn:1000000,usedTodayNgn:0,remainingTodayNgn:1000000}}};createRoot(document.getElementById('root')).render(<React.StrictMode><Page feature='limits' email='fixture' getAccessToken={async()=> 'fixture'} onBack={()=>{}}/></React.StrictMode>)`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx'}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid')
 await page.evaluate(()=>{window.timers=[];const original=window.setTimeout;window.setTimeout=(fn,delay,...args)=>{window.timers.push({fn,delay});return original(fn,delay,...args)}})
 await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByText('Reconnecting to update your usage.',{exact:true}).waitFor();await page.getByText('Bank payout',{exact:true}).waitFor()
 assert.equal(await page.getByText("Today's usage is unavailable",{exact:true}).count(),0)
 assert.equal(await page.getByRole('status',{name:"Loading today's usage",exact:true}).count(),2)
 assert.equal(await page.evaluate(()=>window.calls),1)
 await page.evaluate(()=>{window.fail=false;window.timers.filter(t=>t.delay===30000).at(-1).fn()})
 await page.waitForFunction(()=>window.calls===2);await page.waitForTimeout(100)
 assert.equal(await page.getByText('Reconnecting to update your usage.',{exact:true}).count(),0)
 assert.equal(await page.getByRole('status',{name:"Loading today's usage",exact:true}).count(),0)
 assert.deepEqual(errors,[]);console.log('PASS limits partial success, unknown-usage shimmer, StrictMode single request and automatic recovery.')
}finally{await browser.close()}
