import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createServer} from 'node:http'
import {readFile,mkdir,readdir} from 'node:fs/promises'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 '@privy-io/react-auth':`export const usePrivy=()=>({login:()=>{}})`,
 usePocketIdentity:`export default ()=>({authenticated:true,email:'fixture@example.test',user:{id:'fixture'},getAccessToken:async()=> 'fixture'})`,
 usePocketStockWallet:`export default ()=>({address:'0x'+'1'.repeat(40),refresh:async()=>{},reconcileXPay:()=>{},signXPay:async(p,r,cb)=>{window.signed.push(r.transaction.kind);const hash='0x'+(r.transaction.kind==='swap'?'3':'4').repeat(64);cb(hash);return hash}})`,
 pocketStockPickerTokens:`export const stockPickerTokens=()=>[{address:'0x'+'5'.repeat(40),symbol:'NVDAx',name:'NVIDIA',decimals:18,balance:'0.01',balanceStatus:'available',logoURI:'/brand/fixture.svg'}]`,
 pocketPaymentApproval:`export const requestPocketPaymentApproval=()=>new Promise(resolve=>window.approvePin=resolve);export const takePocketPaymentApproval=()=>({token:'pin',authorization:'Bearer fixture'})`,
 usePocketWalletController:`export const unlockPocketBaseWallet=async()=>({session:{userToken:'ephemeral',wallet:{address:'0x'+'2'.repeat(40)}}})`,
 circleEvmEmailWallet:`export const executeCircleEvmEmailChallenge=async({challengeId})=>{window.challenge=challengeId;await new Promise(resolve=>window.finishCircle=resolve);if(challengeId==='mint')window.minted=true;else window.paid=true}`,
 PocketPaymentSuccess:`import React from 'react';export default ({receipt,onDone})=><section role="status">{receipt.status==='successful'?'Successful':receipt.status}<button onClick={onDone}>Done</button></section>`,
 pocketXPayBankClient:`export const xpayBankRequest=async(_,b)=>window.request(b)`,
}
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import Checkout from './src/pocket/components/PocketXPayBankCheckout';import {xpayBankProgress} from './src/pocket/lib/pocketXPayBankProgress';window.actions=[];window.signed=[];window.failSwap=true;let tick=Date.now();const p={id:'p',checkoutId:'qr',merchantId:'merchant',merchantName:'Test merchant',source:'0x'+'1'.repeat(40),baseWallet:'0x'+'2'.repeat(40),token:'0x'+'5'.repeat(40),symbol:'NVDAx',amount:'0.0037',amountUnits:'3700000000000000',fiatAmount:'1000.00',currency:'NGN',state:'quoted',fundingUnits:'736603',bridgeUnits:'736707',expiresAt:Date.now()+600000,quoteExpiresAt:Date.now()+45000,createdAt:tick,updatedAt:tick};window.payment=p;const view=()=>{p.updatedAt=++tick;p.progress=xpayBankProgress({...p,hasSwap:true});return structuredClone(p)};window.request=async b=>{window.actions.push(b.action);let extra={};switch(b.action){case 'list':return {payments:[]};case 'prepare':break;case 'approve':p.state='approved';break;case 'swap':if(window.failSwap){window.failSwap=false;throw Error('Not enough OKB for the network fee. Add OKB in Pocket, then retry.')}p.state='swap_authorized';extra.transaction={kind:'swap'};break;case 'swapSubmitted':p.state='swap_submitted';p.swapHash=b.hash;break;case 'bridge':p.state='bridging';p.bridge={state:'burn_authorized'};extra.transaction={kind:'burn'};break;case 'bridgeSubmitted':p.bridge={state:'burn_submitted',burnHash:b.hash};break;case 'mint':p.bridge={...p.bridge,state:'mint_submitted'};extra.challengeId='mint';break;case 'payout':p.state='payout_submitted';extra.challengeId='payout';break;case 'status':if(p.state==='swap_submitted')p.state='swap_confirmed';if(p.bridge?.state==='burn_submitted')p.bridge.state='attested';if(window.minted&&p.state==='bridging'){p.bridge.state='completed';p.state='payout_ready'}if(window.paid)p.state='successful';break;default:throw Error(b.action)}return {payment:view(),...extra}};const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===2500?20:ms,...args);createRoot(document.getElementById('root')).render(<Checkout checkoutId="qr" merchantId="merchant" merchantName="Test merchant" assets={['NVDAx']} currency="NGN" onClose={()=>window.closed=true}/>);`
const guardedContents=contents.replace('const original=window.setTimeout;',`const baseRequest=window.request;window.request=async b=>{
 if(b.action==='list'&&window.historyFailure)throw Error('history unavailable');
 if(b.action==='list'&&window.resumeFixture){p.state='payout_ready';p.bridge={state:'completed',burnHash:'0x'+'4'.repeat(64)};localStorage.setItem('pocket.xpay.bank:fixture:qr:merchant',JSON.stringify({id:p.id,stage:'bridge',hash:p.bridge.burnHash}));return {payments:[view()]}}
 if(b.action==='bridgeSubmitted'&&p.state!=='bridging')throw Error('Bridge is not authorized.');
 return baseRequest(b)
};const original=window.setTimeout;`)
const bundle=await build({stdin:{contents:guardedContents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=mocks[a.path]?a.path:a.path.split('/').at(-1);if(mocks[key])return {path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
let css='';try{for(const file of await readdir('dist/assets'))if(file.endsWith('.css'))css+=await readFile('dist/assets/'+file,'utf8')}catch{}
const server=createServer((req,res)=>{if(req.url.endsWith('.svg')){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#76b900"/></svg>')}else res.end('<html><head><style>'+css+'</style></head><body><div id="root" class="mx-auto max-w-md space-y-5 px-5 py-10"></div></body></html>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true})
await mkdir('output/playwright',{recursive:true})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:'+server.address().port);await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.evaluate(()=>{const request=window.request;window.request=async b=>{if(b.action==='bridgeSubmitted'&&window.payment.state!=='bridging')throw Error('Bridge is not authorized.');return request(b)}})
 await page.getByLabel('Amount in NGN',{exact:true}).fill('1000');await page.getByRole('button',{name:'Continue',exact:true}).click()
 const sheet=page.getByRole('dialog',{name:'XPay',exact:true});await sheet.waitFor()
 assert.equal(await sheet.getByRole('list',{name:'Payment progress'}).count(),0)
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Pay Test merchant'&&!b.disabled));await page.screenshot({path:'output/playwright/xpay-bank-review-light.png'})
 await sheet.getByRole('button',{name:'Pay Test merchant',exact:true}).click();await page.waitForFunction(()=>!!window.approvePin)
 assert.equal(await page.evaluate(()=>window.signed.length),0);assert.equal(await sheet.getByRole('list',{name:'Payment progress'}).count(),0)
 await page.evaluate(()=>window.approvePin());await sheet.getByRole('alert').filter({hasText:'Not enough OKB'}).waitFor()
 await sheet.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>window.challenge==='mint')
 assert.match(await sheet.locator('li[aria-current="step"]').innerText(),/Bridging/)
 await page.evaluate(()=>{document.documentElement.classList.add('dark')});await page.screenshot({path:'output/playwright/xpay-bank-bridge-dark.png'})
 await page.evaluate(()=>window.finishCircle());await page.waitForFunction(()=>window.challenge==='payout')
 assert.equal(await sheet.locator('li[aria-current="step"]').count(),0)
 assert.equal(await sheet.getByRole('button',{name:'Pay Test merchant',exact:true}).isDisabled(),true)
 assert.equal(await sheet.getByText('Processing',{exact:true}).count(),0)
 await page.evaluate(()=>window.finishCircle());await page.getByRole('status').filter({hasText:'Successful'}).waitFor()
 assert.deepEqual(await page.evaluate(()=>window.signed),['swap','burn'])
 assert.equal(await page.evaluate(()=>window.actions.filter(a=>a==='prepare').length),1)
 assert.deepEqual(errors,[])
 await page.close()
 const failedHistory=await browser.newPage({viewport:{width:390,height:844}})
 await failedHistory.addInitScript(()=>{window.historyFailure=true})
 await failedHistory.goto('http://127.0.0.1:'+server.address().port);await failedHistory.addScriptTag({content:bundle.outputFiles[0].text})
 await failedHistory.getByRole('alert').filter({hasText:'Could not check your existing payments'}).waitFor()
 await failedHistory.getByLabel('Amount in NGN',{exact:true}).fill('1000')
 assert.equal(await failedHistory.getByRole('button',{name:'Continue',exact:true}).isDisabled(),true)
 assert.equal(await failedHistory.evaluate(()=>window.actions.includes('prepare')),false)
 await failedHistory.evaluate(()=>{window.historyFailure=false});await failedHistory.getByRole('button',{name:'Try again',exact:true}).click()
 await failedHistory.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Continue'&&!b.disabled))
 await failedHistory.close()
 const resumed=await browser.newPage({viewport:{width:390,height:844}})
 await resumed.addInitScript(()=>{window.resumeFixture=true})
 await resumed.goto('http://127.0.0.1:'+server.address().port);await resumed.addScriptTag({content:bundle.outputFiles[0].text})
 const resumedSheet=resumed.getByRole('dialog',{name:'XPay',exact:true});await resumedSheet.waitFor()
 await resumed.waitForFunction(()=>!JSON.parse(localStorage.getItem('pocket.xpay.bank:fixture:qr:merchant')||'{}').hash)
 await resumedSheet.getByRole('button',{name:'Continue payment',exact:true}).click();await resumed.waitForFunction(()=>window.challenge==='payout')
 await resumed.evaluate(()=>window.finishCircle());await resumed.getByRole('status').filter({hasText:'Successful'}).waitFor()
 assert.deepEqual(await resumed.evaluate(()=>window.signed),[])
 assert.equal(await resumed.evaluate(()=>window.actions.includes('bridgeSubmitted')||window.actions.includes('prepare')),false)
 await resumed.close()
 console.log('PASS checkout: existing selector/sheet, PIN first, low-OKB retry without new payment, swap/burn once, truthful bridge progress, no payment Processing before Circle approval, final success.')
 console.log('PASS recovery: acknowledged source hash cleared, restored payout does not resubmit burn, and failed history blocks preparation until an explicit successful retry.')
}finally{await browser.close();server.close()}
