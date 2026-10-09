import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Panel from './src/pocket/components/PocketUsdtBridgePanel';
window.requests=[];window.fail=false;
window.fetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;if(!body)return new Response(JSON.stringify({ok:true,pending:[]}));window.requests.push(body);if(body.action!=='quote')throw Error('No transaction allowed in fixture');if(window.fail)return new Response(JSON.stringify({ok:false,error:'Quote unavailable'}),{status:503});await new Promise(r=>setTimeout(r,body.amount==='1'?800:20));return new Response(JSON.stringify({ok:true,quoteToken:'fixture',sufficientBalance:Number(body.amount)<=8,quote:{id:body.amount+'-'+Date.now(),source:body.source,destination:body.destination,walletAddress:'0x'+'1'.repeat(40),amount:body.amount,receive:String(Number(body.amount)-.01),minimumReceive:String(Number(body.amount)-.02),fee:'.01',expiresAt:Date.now()+2000}}))};
createRoot(document.getElementById('root')).render(<MemoryRouter><Panel owner='form-fixture' getAccessToken={async()=> 'fixture'} getSession={async()=>{throw Error('Fixture approval unavailable')}} balances={[{key:'arbitrum',usdt:8}]} refresh={async()=>{}} onActivity={()=>{}} onBusyChange={()=>{}}/></MemoryRouter>);`
const mocks={usePocketIdentity:`export default()=>({authenticated:true,email:'fixture@test',getAccessToken:async()=>null})`,usePocketWallets:`export default()=>({resolved:true,wallets:{},setWallets:()=>{}})`,usePocketWalletController:`export default()=>({ensureWallet:async()=>{throw Error('No live wallet')}})`,PocketNetworkBalance:`export default()=>null`,PocketRouteShell:`export default({children})=>children`,circleEvmEmailWallet:`export const executeCircleEvmEmailChallenge=async()=>{throw Error('No live challenge')}`}
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();return mocks[key]?{path:key,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'jsx'}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
 await page.goto('https://fixture.test')
 await page.addScriptTag({content:result.outputFiles[0].text})
 await page.getByRole('button',{name:'Enter bridge amount',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Review bridge',exact:true}).count(),0)
 const input=page.getByLabel('USDT bridge amount')
 await input.fill('1')
 await page.waitForFunction(()=>window.requests.some(r=>r.amount==='1'))
 assert.equal(await input.isEnabled(),true)
 await input.fill('2')
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 await page.waitForTimeout(900)
 assert.match(await page.locator('body').innerText(),/1\.99 USDT/)
 assert.doesNotMatch(await page.locator('body').innerText(),/0\.99 USDT/)
 const before=await page.evaluate(()=>window.requests.length)
 await page.waitForFunction(n=>window.requests.length>n,before)
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 await page.getByRole('button',{name:'Max',exact:true}).click()
 assert.equal(await input.inputValue(),'8')
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 await input.fill('9')
 await page.getByRole('button',{name:'Add funds',exact:true}).waitFor()
 await page.evaluate(()=>window.fail=true)
 await input.fill('3')
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor()
 await page.evaluate(()=>window.fail=false)
 await page.getByRole('button',{name:'Try again',exact:true}).click()
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>window.requests.every(r=>r.action==='quote')),true)
 console.log('PASS automatic quote, editable input, stale quote rejection, expiry refresh, Max, funding shortfall and retry; no transfer submitted.')
}finally{await browser.close()}
