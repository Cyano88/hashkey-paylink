import {checkoutTestCss} from './checkout-test-css.mjs'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync,mkdirSync} from 'node:fs'
import {checkoutStablecoins} from '../src/lib/checkoutStablecoins.ts'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const id='chkx_'+'1'.repeat(24),assets=checkoutStablecoins('xlayer')
const mocks={
 usePocketIdentity:`export default ()=>({authenticated:true,email:'payer@example.com',logout:async()=>{window.logouts++},user:{id:'payer'},getAccessToken:async()=>''})`,
 'react-router-dom':`export const useLocation=()=>({pathname:'/pay/c/${id}',search:'?browser=1'}),useNavigate=()=>()=>{},useSearchParams=()=>[new URLSearchParams()];`,
 PocketEmailLogin:`export default()=>null`,usePocketSlowConfirmation:`export default ()=>false`,
 PocketGetApp:`export default ()=>null`,PocketXPayLinks:`export default ()=>null`,PocketCheckoutSwap:`export default()=>null`,
 UnifiedReceipt:`export const FullScreenReceiptSurface=()=>null`,PocketLocalEquivalent:`export default ()=>null`,
 pocketPaymentApproval:`export const POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT='cancel';export const preparePocketPaymentApproval=async()=>{};export const requestPocketPaymentApproval=async()=>{throw Error('Duplicate approval')}`,
 PocketArcTokenPicker:`export default ()=>null`,pocketStockPickerTokens:`export const stockPickerTokens=()=>[]`,pocketStockDisplay:`export const formatStockQuantity=String`,pocketRail:`export const xStockPath=s=>s`,
 pocketXStocksWallet:`export const stockUsdc=${JSON.stringify(assets[0])},stockAssets=[],stockQuantity=(n,d)=>String(Number(n)/10**d);`,
 pocketXPayClient:`const payment=()=>({id:'fixture-payment',merchantId:'${id}',merchantName:'Demo store',payer:'payer',token:window.asset.address,recipient:'seller',amount:'1.5',symbol:window.asset.symbol,usd:'1.50',createdAt:Date.now(),status:'ready',expiresAt:Date.now()+300000});export const xpayRequest=async(_,b)=>{if(b.action==='merchant')return {merchant:{id:'${id}',name:'Demo store',tokens:[window.asset.address.toLowerCase()],fixedAmount:'1.5',expiresAt:Date.now()+900000}};if(b.action==='prepare'){window.prepares++;if(window.mode==='own')throw Error('You cannot pay your own XPay QR.');return {payment:payment()}}if(b.action==='authorize'){window.authorizes++;return {payment:{...payment(),status:'submitted'}}}if(b.action==='confirm'){await new Promise(resolve=>window.finishCheck=resolve);return {payment:{...payment(),status:'paid',hash:'0x'+'a'.repeat(64)}}}if(b.action==='status')return {payment:{...payment(),status:'submitted'}};throw Error(b.action)}`,
}
const contents=`import React from'react';import{createRoot}from'react-dom/client';import{parseUnits}from'viem';import XPay from './src/pocket/components/PocketXPay';window.prepares=0;window.authorizes=0;window.sends=0;window.transfers=0;window.logouts=0;const a=window.asset;const held=window.mode==='funds'?'0.5':'10';const wallet={address:'payer',snapshot:{cash:parseUnits(held,6),usdt:parseUnits(held,6),holdings:[{asset:a,units:parseUnits(held,a.decimals)}],complete:true},refresh:async()=>{},connect:async()=>{},prepareTransfer:async(asset,recipient,amount)=>{window.transfers++;if(window.mode==='funds')throw Error('Insufficient '+a.symbol+' balance including the network fee.');const fee=window.mode==='changed'&&window.transfers>1?'0.02':'0.01';return {owner:'payer',asset,recipient,amount,units:parseUnits(amount,a.decimals),decimals:a.decimals,fee:2000000000000000n,sponsored:window.mode!=='gas',expiresAt:window.mode==='changed'&&window.transfers===1?Date.now()-1:Date.now()+60000,...(window.mode!=='gas'?{reimbursement:{feeUnits:parseUnits(fee,a.decimals).toString(),intent:{asset:a.symbol}}}:{})}},send:async(r,h)=>{if(window.mode==='cancel')throw Error('User rejected');window.sends++;await h.beforeSubmit();const hash='0x'+'a'.repeat(64);h.onSubmitted(hash);return hash}};createRoot(document.getElementById('root')).render(<XPay wallet={wallet} checkout merchantOverride="${id}" checkoutReturnUrl="https://merchant.example/complete"/>);`
const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/PocketDepositPage$/},()=>({path:'deposit',namespace:'deposit-fixture'}));b.onLoad({filter:/.*/,namespace:'deposit-fixture'},()=>({contents:'export default ()=>null'}));b.onResolve({filter:/.*/},a=>{const key=mocks[a.path]?a.path:a.path.split('/').at(-1);if(mocks[key])return{path:key,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({headless:true,channel:'chrome'});mkdirSync('output/playwright',{recursive:true})
try{
 for(const width of [390,1280])for(const asset of assets)for(const mode of ['normal',...(width===390?['own','funds','cancel','changed','gas']:[])]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://checkout.test/**',r=>{if(r.request().url().includes('/api/'))return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,checkout:{id,status:'paid'},returnUrl:'https://merchant.example/complete'})});if(r.request().url().endsWith('.png'))return r.fulfill({contentType:'image/png',body:readFileSync('public/hash-logo-transparent.png')});return r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root" class="px-4"></div></body></html>'})})
  await page.goto('https://checkout.test/');await page.evaluate(({asset,mode})=>{window.asset=asset;window.mode=mode},{asset,mode});await page.addScriptTag({content:result.outputFiles[0].text})
  await page.getByRole('button',{name:'Change account',exact:true}).waitFor()
  assert.equal(await page.getByRole('dialog').count(),0,'Hosted checkout must not use Pocket payment modal')
  assert.equal(await page.getByLabel('Hash PayLink',{exact:true}).count(),1)
  assert.equal(await page.getByText('Pocket',{exact:true}).count(),0)
  assert.equal(await page.locator('input[type=number]').count(),0,'Fixed amount is not an editable Pocket field')
  if(mode==='own'){
   await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/own account/);assert.doesNotMatch(await page.getByRole('alert').innerText(),/XPay|QR/)
   const e=await page.getByRole('alert').boundingBox(),cta=await page.getByRole('button',{name:'Continue',exact:true}).boundingBox();assert.ok(e.y<cta.y)
   await page.getByRole('button',{name:'Change account'}).click();assert.equal(await page.evaluate(()=>window.logouts),1)
  }else if(mode==='funds'){
   await page.getByRole('button',{name:'Add funds',exact:true}).click();await page.getByText('Send '+asset.symbol+' on X Layer only.').waitFor()
  }else{
   await page.getByRole('button',{name:'Pay securely',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'1.50 '+asset.symbol,exact:true}).count(),1)
   assert.equal(await page.getByText(mode==='gas'?'1.50 '+asset.symbol+' + 0.002 OKB':'1.51 '+asset.symbol,{exact:true}).count(),1)
   assert.equal(await page.evaluate(()=>window.sends),0);assert.equal(await page.evaluate(()=>window.authorizes),0)
   if(mode==='normal')await page.screenshot({path:'output/playwright/xlayer-web-'+asset.symbol+'-'+width+'.png'})
   await page.getByRole('button',{name:'Pay securely',exact:true}).click()
   if(mode==='changed'){await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/refreshed network fee/);assert.equal(await page.evaluate(()=>window.sends),0);await page.getByText('1.52 '+asset.symbol,{exact:true}).waitFor();await page.getByRole('button',{name:'Pay securely',exact:true}).click()}
   if(mode==='cancel'){await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Cancelled/)}else{
    await page.waitForFunction(()=>typeof window.finishCheck==='function');assert.equal(await page.getByText('Successful',{exact:true}).count(),0)
    assert.equal(await page.evaluate(()=>window.sends),1);assert.equal(await page.evaluate(()=>window.authorizes),1)
    await page.evaluate(()=>window.finishCheck());await page.getByText('Successful',{exact:true}).waitFor();await page.getByRole('link',{name:'Return to merchant',exact:true}).waitFor()
   }
  }
  if(['own','funds','cancel'].includes(mode)){assert.equal(await page.evaluate(()=>window.sends),0);assert.equal(await page.evaluate(()=>window.authorizes),0)}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS hosted X Layer USDC/USDT/USDe/USDG: shared web UI, fixed amounts, totals, self-payment copy, funding, cancellation, fee re-review, OKB gas, one approved send and verified result.')
}finally{await browser.close()}
