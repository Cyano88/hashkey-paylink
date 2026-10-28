import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React,{lazy,Suspense}from'react';import{createRoot}from'react-dom/client';import Boundary from'./src/components/AppErrorBoundary';const Checkout=lazy(()=>window.fail?Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://checkout.test/assets/private-chunk.js')):Promise.resolve({default:()=> <h1>Review payment</h1>}));createRoot(document.getElementById('root')).render(<Boundary checkout><Suspense fallback={<p>Opening checkout</p>}><Checkout/></Suspense></Boundary>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const css=await checkoutTestCss();const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [320,390,1280]){
 let documents=0,paymentWrites=0;const page=await browser.newPage({viewport:{width,height:844}})
 await page.route('https://checkout.test/**',r=>{if(r.request().method()==='POST')paymentWrites++;if(r.request().resourceType()!=='document')return r.fulfill({status:404,body:''});documents++;return r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script>window.fail='+String(documents===1)+';</script><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></body></html>'})})
 const url='https://checkout.test/pay/c/chkx_12345678?browser=1&attempt=pat_123'
 await page.goto(url);await page.getByRole('heading',{name:'Checkout could not load',exact:true}).waitFor()
 assert.equal(await page.getByText(/private-chunk|dynamically imported/).count(),0)
 assert.equal(await page.getByLabel('Hash PayLink',{exact:true}).count(),1)
 assert.equal(await page.getByRole('link',{name:'Privacy',exact:true}).count(),1)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.equal(documents,1,'Must not automatically reload a payment session')
 await page.getByRole('button',{name:'Reload checkout',exact:true}).click()
 await page.getByRole('heading',{name:'Review payment',exact:true}).waitFor()
 assert.equal(page.url(),url);assert.equal(documents,2);assert.equal(paymentWrites,0)
 await page.close()
}}finally{await browser.close()}
console.log('PASS checkout load failure: clean recovery, no raw module error, explicit reload preserves URL, no automatic reload or payment writes, mobile/desktop')
