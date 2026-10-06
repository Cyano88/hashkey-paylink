import {checkoutTestCss} from './checkout-test-css.mjs'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync,mkdirSync} from 'node:fs'
import {createServer} from 'node:http'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const id='chkx_'+'1'.repeat(24)
const mocks={
 usePocketIdentity:`export default ()=>({user:{id:'payer'},getAccessToken:async()=>''})`,
 'react-router-dom':`export const useLocation=()=>({pathname:'/pay/c/${id}'}),useNavigate=()=>()=>{},useSearchParams=()=>[new URLSearchParams()];`,
 usePocketSlowConfirmation:`export default ()=>false`,
 PocketGetApp:`export default ()=>null`,PocketXPayLinks:`export default ()=>null`,
 PocketCheckoutSwap:`import React from 'react';export default ({onClose})=><section><h1>Separate conversion approval</h1><button onClick={onClose}>Back to payment</button></section>`,
 UnifiedReceipt:`export const FullScreenReceiptSurface=()=>null`,PocketLocalEquivalent:`export default ()=>null`,
 pocketPaymentApproval:`export const POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT='cancel';export const preparePocketPaymentApproval=async()=>{};export const requestPocketPaymentApproval=async()=>{throw Error('Duplicate approval')}`,
 PocketArcTokenPicker:`export default ()=>null`,pocketStockPickerTokens:`export const stockPickerTokens=()=>[]`,pocketStockDisplay:`export const formatStockQuantity=String`,pocketRail:`export const xStockPath=s=>s`,
 pocketXStocksWallet:`export const stockUsdc={address:'usdc',symbol:'USDC'},stockAssets=[{address:'token',symbol:'NVDAx'}],stockQuantity=String;export const prepareStockTransfer=async(owner,asset,recipient,amount)=>({owner,asset,recipient,amount,fee:100n,expiresAt:Date.now()+60000})`,
 pocketXPayClient:`const payment=()=>({id:'fixture-payment',merchantId:'${id}',merchantName:'Demo store',payer:'payer',token:'token',recipient:'seller',amount:'0.25',symbol:'NVDAx',usd:'50.00',createdAt:Date.now(),status:'ready',expiresAt:Date.now()+300000});export const xpayRequest=async(_,b)=>{if(b.action==='merchant')return {merchant:{id:'${id}',name:'Demo store',tokens:['token'],fixedAmount:'0.25',swapEnabled:window.swapEnabled}};if(b.action==='prepare'){window.prepares++;return {payment:payment()}}if(b.action==='authorize'){window.authorizes++;return {payment:{...payment(),status:'submitted'}}}if(b.action==='confirm'){await new Promise(resolve=>window.finishCheck=resolve);return {payment:{...payment(),status:'paid',hash:'0x'+'a'.repeat(64)}}}if(b.action==='status')return {payment:{...payment(),status:'submitted'}};throw Error(b.action)}`,
}
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import XPay from './src/pocket/components/PocketXPay';window.prepares=0;window.authorizes=0;window.sends=0;const wallet={address:'payer',refresh:async()=>{},send:async(r,h)=>{window.sends++;await h.beforeSubmit();const hash='0x'+'a'.repeat(64);h.onSubmitted(hash);return hash}};createRoot(document.getElementById('root')).render(<XPay wallet={wallet} checkout merchantOverride="${id}"/>);`
const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/PocketDepositPage$/},()=>({path:'deposit',namespace:'deposit-fixture'}));b.onLoad({filter:/.*/,namespace:'deposit-fixture'},()=>({contents:'export default ()=>null'}));b.onResolve({filter:/.*/},a=>{const key=mocks[a.path]?a.path:a.path.split('/').at(-1);if(mocks[key])return{path:key,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
const server=createServer((req,res)=>{if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,checkout:{id,status:'paid'},returnUrl:'https://merchant.example/complete'}));return}res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>')});await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true,channel:'chrome'});mkdirSync('output/playwright',{recursive:true})
try{
 for(const width of [390,1280])for(const dark of [false,true]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(dark=>{window.swapEnabled=dark;document.documentElement.classList.toggle('dark',dark)},dark)
  await page.addScriptTag({content:result.outputFiles[0].text});await page.addStyleTag({content:await checkoutTestCss()})
  const amount=page.getByLabel('Amount',{exact:true});try{await amount.waitFor({timeout:10000})}catch(e){console.error({errors,body:await page.locator('body').innerText()});throw e}assert.equal(await amount.inputValue(),'0.25');assert.equal(await amount.getAttribute('readonly'),'')
  assert.equal(await page.getByRole('button',{name:'Convert and pay',exact:true}).count(),dark?1:0)
  if(dark){await page.getByRole('button',{name:'Convert and pay',exact:true}).click();await page.getByRole('heading',{name:'Separate conversion approval'}).waitFor();assert.equal(await page.evaluate(()=>window.sends),0);await page.getByRole('button',{name:'Back to payment',exact:true}).click()}
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Confirm payment',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.sends),0);const bounds=await page.getByRole('dialog',{name:'Confirm payment',exact:true}).boundingBox();assert.ok(bounds&&Math.abs(bounds.height-844)<2&&Math.abs(bounds.width-width)<2,'Human checkout fills the viewport')
  await page.screenshot({path:`output/playwright/stock-checkout-${width}-${dark?'dark':'light'}-review.png`})
  await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await page.waitForFunction(()=>typeof window.finishCheck==='function');assert.equal(await page.getByText('Successful',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.sends),1)
  await page.evaluate(()=>window.finishCheck());await page.getByText('Successful',{exact:true}).waitFor();await page.getByRole('link',{name:'Return to merchant',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.sends),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:`output/playwright/stock-checkout-${width}-${dark?'dark':'light'}-success.png`});assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS stock browser checkout: fixed amount, optional conversion, separate approval, one send, verified success, mobile/desktop and both themes.')
}finally{await browser.close();server.close()}
