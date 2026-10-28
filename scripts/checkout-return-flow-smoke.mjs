import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {merchantOrderCopy} from '../src/components/MerchantOrderStatus.tsx'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Result from'./src/components/BrowserPaymentResult';const root=createRoot(document.getElementById('root'));window.renderResult=(state,url)=>root.render(<Result state={state} returnUrl={url} merchant="Store" amount="1.5 USDC"/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',plugins:[{name:'shell',setup(b){b.onResolve({filter:/PocketBottomSheet$|PocketTransactionSheet$/},a=>({path:a.path,namespace:'shell'}));b.onLoad({filter:/.*/,namespace:'shell'},a=>({contents:a.path.endsWith('PocketBottomSheet')?'export default ({children})=><main>{children}</main>':'export default ({state})=><h1>{state}</h1>',loader:'tsx',resolveDir:process.cwd()}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 for(const state of ['pending','failed','successful']) {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://return.test/**',r=>r.fulfill({contentType:'text/html',body:r.request().url().endsWith('/store')?'<h1>Merchant order</h1>':'<div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'}))
  await page.goto('https://return.test/checkout');await page.clock.install()
  await page.evaluate(s=>window.renderResult(s,'https://return.test/store'),state)
  await page.getByRole('heading',{name:state,exact:true}).waitFor()
  await page.clock.runFor(3500)
  if(state==='successful')await page.waitForURL('https://return.test/store')
  else assert.equal(page.url(),'https://return.test/checkout','Unconfirmed payments must not redirect')
  assert.deepEqual(errors,[]);await page.close()
 }
}finally{await browser.close()}
assert.equal(merchantOrderCopy('expired').title,'Checkout expired')
assert.equal(merchantOrderCopy('pending').title,'Payment not completed')
assert.equal(merchantOrderCopy('processing').action,'Check payment status')
assert.equal(merchantOrderCopy('paid').title,'Your order is confirmed.')
console.log('PASS browser return: verified success redirects; pending and failed stay; merchant distinguishes expired, unpaid, processing and paid.')
