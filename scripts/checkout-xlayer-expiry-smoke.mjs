import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync} from 'node:fs'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from'./src/pocket/pages/PocketXPayCheckoutPage';createRoot(document.getElementById('root')).render(<MemoryRouter><Page merchantOverride={'chkx_'+'a'.repeat(24)} returnUrl="https://store.test/order"/></MemoryRouter>);`
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'wallet-fixture',setup(b){b.onResolve({filter:/usePocketIdentity$|usePocketStockWallet$|PocketPaymentSecurityGate$|PrivyLoginProvider$|pocketRoutes$|\/PocketXPay$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:a.path.endsWith('usePocketIdentity')?`export default()=>({authenticated:window.auth,ready:true,user:{id:'test'},email:'test@example.com',getAccessToken:async()=>null})`:a.path.endsWith('usePocketStockWallet')?'export default()=>({})':a.path.endsWith('PocketPaymentSecurityGate')?'export default({children})=>children':a.path.endsWith('PrivyLoginProvider')?'export const usePrivyLoginLauncher=()=>({requestLogin:()=>{}})':a.path.endsWith('pocketRoutes')?'export const pocketApiUrl=p=>p':`import{CheckoutExpired}from'./src/components/CheckoutExpiry';export default()=>window.pending?<h1>Payment pending</h1>:<CheckoutExpired merchant="Lunchroom" returnUrl="https://store.test/order"/>`}))}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [320,390,1280])for(const auth of [false,true]){
 const page=await browser.newPage({viewport:{width,height:844}})
 await page.route('https://checkout.test/**',r=>{if(r.request().url().includes('/api/'))return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,merchant:{name:'Lunchroom',expiresAt:Date.now()-1000}})});if(r.request().url().endsWith('.png'))return r.fulfill({contentType:'image/png',body:readFileSync('public/hash-logo-transparent.png')});return r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root" class="px-4 py-8"></div></body></html>'})})
 for(const pending of auth?[false,true]:[false]){
  await page.goto('https://checkout.test/');await page.evaluate(({auth,pending})=>{window.auth=auth;window.pending=pending},{auth,pending});await page.addScriptTag({content:bundle.outputFiles[0].text})
  await page.getByRole('heading',{name:pending?'Payment pending':'Checkout expired',exact:true}).waitFor()
  assert.equal(await page.getByText('Pocket',{exact:true}).count(),0)
  assert.equal(await page.getByText('Hash PayLink checkout',{exact:true}).count(),0)
  if(pending){assert.equal(await page.getByRole('heading',{name:'Checkout expired'}).count(),0)}else{
   assert.equal(await page.getByLabel('Hash PayLink',{exact:true}).count(),1);assert.equal(await page.getByLabel('Checkout information').count(),1)
   assert.equal(await page.getByRole('link',{name:'Back to store'}).getAttribute('href'),'https://store.test/order')
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   if(auth)await page.screenshot({path:'output/playwright/xlayer-expiry-'+width+'.png'})
  }
 }
 await page.close()
}}finally{await browser.close()}
console.log('PASS hosted X Layer expiry: authenticated and guest have one brand and footer; no Pocket wrapper; pending child preserved; mobile/desktop')
